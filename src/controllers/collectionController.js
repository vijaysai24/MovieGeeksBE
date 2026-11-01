const { matchedData } = require("express-validator");
const service = require("../services/collectionService");
const { parsePagination } = require("../utils/pagination");
const { ok, created } = require("../utils/response");
const handle = require("../utils/handle");

const input = (req) => matchedData(req);

const create = handle(async (req, res) => {
    created(res, await service.create(req.user.id, input(req)), "List created");
});

const update = handle(async (req, res) => {
    const { id, ...changes } = input(req);
    ok(res, await service.update(req.user.id, id, changes), "List updated");
});

const remove = handle(async (req, res) => {
    await service.remove(req.user.id, input(req).id);
    ok(res, null, "List deleted");
});

const get = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.get(data.id, req.user?.id ?? null, parsePagination(data, 50)));
});

const listMine = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.listMine(req.user.id, data, parsePagination(data, 50)));
});

const listForUser = handle(async (req, res) => {
    const data = input(req);
    ok(res, await service.listForUser(data.username, req.user || null, parsePagination(data, 24)));
});

const listPublic = handle(async (req, res) => {
    ok(res, await service.listPublic(req.user || null, parsePagination(input(req), 24)));
});

const addItem = handle(async (req, res) => {
    const { id, ...item } = input(req);
    ok(res, await service.addItem(req.user.id, id, item), "Added to list");
});

const updateItem = handle(async (req, res) => {
    const { id, ...item } = input(req);
    await service.updateItem(req.user.id, id, item);
    ok(res, null, "Note saved");
});

const removeItem = handle(async (req, res) => {
    const { id, ...item } = input(req);
    ok(res, await service.removeItem(req.user.id, id, item), "Removed from list");
});

const reorder = handle(async (req, res) => {
    const { id, items } = input(req);
    await service.reorder(req.user.id, id, items);
    ok(res, null, "Order saved");
});

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
