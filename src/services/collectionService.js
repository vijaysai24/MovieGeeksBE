const repository = require("../repositories/collectionRepository");
const activities = require("../repositories/activityRepository");
const titleService = require("./titleService");
const socialService = require("./socialService");
const AppError = require("../utils/AppError");
const { toAuthor } = require("../utils/userPresenter");
const { toTitleCard } = require("../utils/titlePresenter");
const { paginated } = require("../utils/pagination");

const COLLECTION_LIMIT = 100;
const ITEM_LIMIT = 500;

const toCollection = (row, viewerId = null) => ({
    id: row.id,
    name: row.name,
    description: row.description || null,
    isPublic: Boolean(row.is_public),
    isRanked: Boolean(row.is_ranked),
    itemCount: Number(row.item_count),
    coverPosters: row.cover_posters ? row.cover_posters.split("|").slice(0, 4) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: toAuthor(row),
    isOwn: viewerId !== null && viewerId === row.user_id,
    ...(row.contains_title !== undefined && { containsTitle: Boolean(row.contains_title) })
});

// Private lists do not exist for anyone but their owner.
const loadVisible = async (collectionId, viewerId) => {
    const row = await repository.findById(collectionId);
    if (!row || (!row.is_public && row.user_id !== viewerId)) throw AppError.notFound("List not found");
    return row;
};

const loadOwn = async (collectionId, userId) => {
    const row = await repository.findById(collectionId);
    if (!row || row.user_id !== userId) throw AppError.notFound("List not found");
    return row;
};

// A public list reaching the feed once is enough; edits do not re-post it.
const announce = async (userId, collectionId) => {
    await activities.removeForTarget(userId, "LISTED", collectionId);
    await activities.record({ userId, type: "LISTED", targetId: collectionId });
};

const create = async (userId, { name, description, isPublic = true, isRanked = false }) => {
    if (await repository.countForUser(userId) >= COLLECTION_LIMIT) {
        throw AppError.badRequest(`You can keep up to ${COLLECTION_LIMIT} lists`, "LIMIT_REACHED");
    }
    const id = await repository.create({ userId, name, description, isPublic, isRanked });
    if (isPublic) await announce(userId, id);
    return toCollection(await repository.findById(id), userId);
};

const update = async (userId, collectionId, changes) => {
    const existing = await loadOwn(collectionId, userId);
    await repository.update(collectionId, changes);
    if (changes.isPublic === true && !existing.is_public) await announce(userId, collectionId);
    return toCollection(await repository.findById(collectionId), userId);
};

const remove = async (userId, collectionId) => {
    await loadOwn(collectionId, userId);
    await repository.remove(collectionId);
    await activities.removeForTarget(userId, "LISTED", collectionId);
};

const get = async (collectionId, viewerId, pagination) => {
    const row = await loadVisible(collectionId, viewerId);
    const items = await repository.listItems(collectionId, pagination);
    return {
        ...toCollection(row, viewerId),
        items: paginated(
            items.map((item) => ({ ...toTitleCard(item), position: item.position, note: item.note || null, addedAt: item.added_at })),
            Number(row.item_count),
            pagination
        )
    };
};

const listMine = async (userId, { containing }, pagination) => {
    const containingTitleId = containing ? await titleService.findTitleId(containing.mediaType, containing.tmdbId) : null;
    const { rows, total } = await repository.listForUser(userId, {
        includePrivate: true,
        // A title nobody has stored yet cannot be in any list; -1 matches nothing.
        containingTitleId: containing ? containingTitleId || -1 : null,
        ...pagination
    });
    return paginated(rows.map((row) => toCollection(row, userId)), total, pagination);
};

const listForUser = async (username, viewer, pagination) => {
    const user = await socialService.findUser(username);
    const isSelf = viewer?.id === user.id;
    const { rows, total } = await repository.listForUser(user.id, { includePrivate: isSelf, ...pagination });
    return paginated(rows.map((row) => toCollection(row, viewer?.id ?? null)), total, pagination);
};

const listPublic = async (viewer, pagination) => {
    const { rows, total } = await repository.listPublic(pagination);
    return paginated(rows.map((row) => toCollection(row, viewer?.id ?? null)), total, pagination);
};

const addItem = async (userId, collectionId, { mediaType, tmdbId, note }) => {
    const row = await loadOwn(collectionId, userId);
    if (Number(row.item_count) >= ITEM_LIMIT) {
        throw AppError.badRequest(`A list can hold up to ${ITEM_LIMIT} titles`, "LIMIT_REACHED");
    }
    const titleId = await titleService.ensureTitle(mediaType, tmdbId);
    const added = await repository.addItem(collectionId, titleId, note);
    if (!added) throw AppError.conflict("That title is already on this list", "ALREADY_LISTED");
    return toCollection(await repository.findById(collectionId), userId);
};

const updateItem = async (userId, collectionId, { mediaType, tmdbId, note }) => {
    await loadOwn(collectionId, userId);
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (!titleId || !(await repository.updateItemNote(collectionId, titleId, note))) {
        throw AppError.notFound("That title is not on this list");
    }
};

const removeItem = async (userId, collectionId, { mediaType, tmdbId }) => {
    await loadOwn(collectionId, userId);
    const titleId = await titleService.findTitleId(mediaType, tmdbId);
    if (!titleId || !(await repository.removeItem(collectionId, titleId))) {
        throw AppError.notFound("That title is not on this list");
    }
    return toCollection(await repository.findById(collectionId), userId);
};

// The new order must name exactly the titles already on the list, each once.
const reorder = async (userId, collectionId, items) => {
    await loadOwn(collectionId, userId);
    const current = new Set(await repository.itemTitleIds(collectionId));
    const titleIds = [];
    for (const item of items) {
        const titleId = await titleService.findTitleId(item.mediaType, item.tmdbId);
        if (!titleId || !current.has(titleId)) {
            throw AppError.badRequest("The new order includes a title that is not on this list", "INVALID_ORDER");
        }
        titleIds.push(titleId);
    }
    if (new Set(titleIds).size !== current.size || titleIds.length !== current.size) {
        throw AppError.badRequest("The new order must include every title on the list exactly once", "INVALID_ORDER");
    }
    await repository.reorder(collectionId, titleIds);
};

module.exports = {
    create,
    update,
    remove,
    get,
    listMine,
    listForUser,
    listPublic,
    addItem,
    updateItem,
    removeItem,
    reorder
};
