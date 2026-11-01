const db = require("../config/db");

const findByEmail = async (email) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE email=?",
         [email]);

    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE id=?",
        [id]);

    return rows[0];
};

const findByUsername = async (username) => {
    const [rows] = await db.execute(
        "SELECT * FROM users WHERE username=?",
        [username]);

    return rows[0];
};

const createUser = async (name, username, email, password) => {
    const [result] = await db.execute(
        `INSERT INTO users
        (name,username,email,password)
        VALUES (?,?,?,?)`,
        [name, username, email, password]
    );

    return result.insertId;
};

const updatePassword = async (id, password) => {
    await db.execute(
        "UPDATE users SET password=? WHERE id=?",
        [password, id]
    );
};

module.exports = {
    findByEmail,
    findById,
    findByUsername,
    createUser,
    updatePassword
};
