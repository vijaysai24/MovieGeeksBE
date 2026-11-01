const { matchedData } = require("express-validator");
const service = require("../services/partyService");
const { ok, created } = require("../utils/response");
const handle = require("../utils/handle");

const input = (req) => matchedData(req);

module.exports = {
    listMine: handle(async (req, res) => {
        ok(res, await service.listMine(req.user.id));
    }),
    create: handle(async (req, res) => {
        created(res, await service.create(req.user.id, input(req).name), "Watch party created");
    }),
    join: handle(async (req, res) => {
        ok(res, await service.join(req.user.id, input(req).code), "You're in");
    }),
    get: handle(async (req, res) => {
        ok(res, await service.get(input(req).id, req.user.id));
    }),
    rename: handle(async (req, res) => {
        const { id, name } = input(req);
        ok(res, await service.rename(req.user.id, id, name), "Party renamed");
    }),
    regenerateInvite: handle(async (req, res) => {
        ok(res, await service.regenerateInvite(req.user.id, input(req).id), "New invite code; the old one no longer works");
    }),
    remove: handle(async (req, res) => {
        await service.remove(req.user.id, input(req).id);
        ok(res, null, "Watch party deleted");
    }),
    leave: handle(async (req, res) => {
        await service.leave(req.user.id, input(req).id);
        ok(res, null, "You left the party");
    }),
    removeMember: handle(async (req, res) => {
        const { id, userId } = input(req);
        ok(res, await service.removeMember(req.user.id, id, userId), "Member removed");
    }),
    addItem: handle(async (req, res) => {
        const { id, ...ref } = input(req);
        ok(res, await service.addItem(req.user.id, id, ref), "Added to the party's list");
    }),
    removeItem: handle(async (req, res) => {
        const { id, ...ref } = input(req);
        ok(res, await service.removeItem(req.user.id, id, ref), "Taken off the list");
    }),
    vote: handle(async (req, res) => {
        const { id, ...ref } = input(req);
        ok(res, await service.vote(req.user.id, id, ref));
    }),
    unvote: handle(async (req, res) => {
        const { id, ...ref } = input(req);
        ok(res, await service.unvote(req.user.id, id, ref));
    }),
    suggestions: handle(async (req, res) => {
        ok(res, await service.suggestions(req.user.id, input(req).id));
    })
};
