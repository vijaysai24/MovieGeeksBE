const toISODate = (date) => date.toISOString().slice(0, 10);

const today = () => toISODate(new Date());

const daysFromToday = (days) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return toISODate(date);
};

const monthRange = (month) => {
    const [year, monthIndex] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthIndex - 1, 1));
    const last = new Date(Date.UTC(year, monthIndex, 0));
    return { from: toISODate(first), to: toISODate(last) };
};

module.exports = {
    toISODate,
    today,
    daysFromToday,
    monthRange
};
