const crypto = require("crypto");
const repository = require("../repositories/partyRepository");
const notifications = require("../repositories/notificationRepository");
const titleService = require("./titleService");
const AppError = require("../utils/AppError");
const { toAuthor, toPublicUser } = require("../utils/userPresenter");
const { toTitleCard } = require("../utils/titlePresenter");

const OWNED_LIMIT = 20;
const MEMBER_LIMIT = 12;
const ITEM_LIMIT = 100;

// No 0/O or 1/I: codes are read aloud and typed from screenshots.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

const newInviteCode = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
        if (!(await repository.codeExists(code))) return code;
    }
    throw new AppError(503, "Couldn't create an invite code, please try again", "CODE_COLLISION");
};

const toPartySummary = (row, viewerId) => ({
    id: row.id,
    name: row.name,
    owner: toAuthor(row),
    isOwner: row.owner_id === viewerId,
    memberCount: Number(row.member_count),
    itemCount: Number(row.item_count),
    createdAt: row.created_at
});

const toItem = (row) => ({
    ...toTitleCard(row),
    votes: Number(row.votes),
    viewerVoted: Boolean(row.viewer_voted),
    voters: row.voters ? row.voters.split(",") : [],
    addedBy: row.author_id ? toAuthor(row) : null,
    addedAt: row.added_at
});

// Parties are private: to anyone outside one, it does not exist.
const loadForMember = async (partyId, userId) => {
    const party = await repository.findById(partyId);
    if (!party || !(await repository.isMember(partyId, userId))) throw AppError.notFound("Watch party not found");
    return party;
};

const loadForOwner = async (partyId, userId) => {
    const party = await loadForMember(partyId, userId);
    if (party.owner_id !== userId) throw AppError.forbidden("Only the party's host can do that");
    return party;
};

const get = async (partyId, userId) => {
    const party = await loadForMember(partyId, userId);
    const [members, items] = await Promise.all([repository.members(partyId), repository.items(partyId, userId)]);
    const mapped = items.map(toItem);

    return {
        ...toPartySummary(party, userId),
        inviteCode: party.invite_code,
        members: members.map((member) => ({ ...toPublicUser(member), joinedAt: member.joined_at, isOwner: member.id === party.owner_id })),
        items: mapped,
        // Tonight's pick needs at least one vote; an untouched list has no winner yet.
        tonight: mapped[0]?.votes > 0 ? mapped[0] : null
    };
};

const listMine = async (userId) => (await repository.listForUser(userId)).map((row) => toPartySummary(row, userId));

const create = async (userId, name) => {
    if (await repository.countOwned(userId) >= OWNED_LIMIT) {
        throw AppError.badRequest(`You can host up to ${OWNED_LIMIT} watch parties`, "LIMIT_REACHED");
    }
    const partyId = await repository.create({ ownerId: userId, name, inviteCode: await newInviteCode() });
    return get(partyId, userId);
};

const join = async (userId, inviteCode) => {
    const party = await repository.findByCode(inviteCode.toUpperCase());
    if (!party) throw AppError.notFound("That invite code doesn't match a watch party", "INVALID_CODE");

    if (!(await repository.isMember(party.id, userId))) {
        if (Number(party.member_count) >= MEMBER_LIMIT) {
            throw AppError.conflict(`This party is full (${MEMBER_LIMIT} members)`, "PARTY_FULL");
        }
        await repository.addMember(party.id, userId);
        await notifications.create({
            userId: party.owner_id,
            type: "PARTY_JOIN",
            actorId: userId,
            entityId: party.id,
            message: party.name
        });
    }
    return get(party.id, userId);
};

const rename = async (userId, partyId, name) => {
    await loadForOwner(partyId, userId);
    await repository.rename(partyId, name);
    return get(partyId, userId);
};

const regenerateInvite = async (userId, partyId) => {
    await loadForOwner(partyId, userId);
    await repository.setInviteCode(partyId, await newInviteCode());
    return get(partyId, userId);
};

const remove = async (userId, partyId) => {
    await loadForOwner(partyId, userId);
    await repository.remove(partyId);
};

// The host can't walk out on their own party; they delete it instead.
const leave = async (userId, partyId) => {
    const party = await loadForMember(partyId, userId);
    if (party.owner_id === userId) {
        throw AppError.badRequest("You're hosting this party. Delete it instead of leaving.", "OWNER_CANNOT_LEAVE");
    }
    await repository.removeMember(partyId, userId);
};

const removeMember = async (userId, partyId, memberId) => {
    await loadForOwner(partyId, userId);
    if (memberId === userId) throw AppError.badRequest("You can't remove yourself from your own party");
    if (!(await repository.removeMember(partyId, memberId))) throw AppError.notFound("That person isn't in this party");
    return get(partyId, userId);
};

const addItem = async (userId, partyId, { mediaType, tmdbId }) => {
    const party = await loadForMember(partyId, userId);
    if (Number(party.item_count) >= ITEM_LIMIT) {
        throw AppError.badRequest(`A party can hold up to ${ITEM_LIMIT} titles`, "LIMIT_REACHED");
    }

    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    if (!(await repository.addItem(partyId, titleId, userId))) {
        throw AppError.conflict("That's already on the party's list", "ALREADY_LISTED");
    }
    // Suggesting something counts as wanting to watch it.
    await repository.vote(partyId, titleId, userId);

    const others = (await repository.memberIds(partyId)).filter((memberId) => memberId !== userId);
    await notifications.createMany(others.map((memberId) => ({
        userId: memberId,
        type: "PARTY_ITEM",
        actorId: userId,
        titleId,
        entityId: partyId,
        message: party.name
    })));

    return get(partyId, userId);
};

const findPartyTitle = async (partyId, { mediaType, tmdbId }) => {
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    const item = titleId ? await repository.findItem(partyId, titleId) : null;
    if (!item) throw AppError.notFound("That title isn't on the party's list");
    return { titleId, item };
};

const removeItem = async (userId, partyId, ref) => {
    const party = await loadForMember(partyId, userId);
    const { titleId, item } = await findPartyTitle(partyId, ref);
    if (item.added_by !== userId && party.owner_id !== userId) {
        throw AppError.forbidden("Only whoever added it, or the host, can take it off");
    }
    await repository.removeItem(partyId, titleId);
    return get(partyId, userId);
};

const vote = async (userId, partyId, ref) => {
    await loadForMember(partyId, userId);
    const { titleId } = await findPartyTitle(partyId, ref);
    await repository.vote(partyId, titleId, userId);
    return get(partyId, userId);
};

const unvote = async (userId, partyId, ref) => {
    await loadForMember(partyId, userId);
    const { titleId } = await findPartyTitle(partyId, ref);
    await repository.unvote(partyId, titleId, userId);
    return get(partyId, userId);
};

const suggestions = async (userId, partyId) => {
    const party = await loadForMember(partyId, userId);
    const minInterested = Math.min(2, Number(party.member_count));
    const rows = await repository.suggestions(partyId, minInterested);
    return rows.map((row) => ({
        ...toTitleCard(row),
        interested: Number(row.interested),
        interestedUsernames: row.interested_usernames ? row.interested_usernames.split(",") : []
    }));
};

module.exports = {
    get,
    listMine,
    create,
    join,
    rename,
    regenerateInvite,
    remove,
    leave,
    removeMember,
    addItem,
    removeItem,
    vote,
    unvote,
    suggestions
};
