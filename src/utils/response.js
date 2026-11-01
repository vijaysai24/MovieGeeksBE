const ok = (res, data, message) => res.status(200).json({
    success: true,
    ...(message && { message }),
    data
});

const created = (res, data, message) => res.status(201).json({
    success: true,
    ...(message && { message }),
    data
});

module.exports = {
    ok,
    created
};
