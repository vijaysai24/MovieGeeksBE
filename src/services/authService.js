const bcrypt = require("bcrypt");

const repository = require("../repositories/authRepository");
const { generateToken } = require("../utils/jwt");

const register = async (name, email, password) => {
    const existingUser = await repository.findByEmail(email);

    if (existingUser) {
        throw new Error("Email already registered");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const id = await repository.createUser(
        name,
        email,
        hashedPassword
    );

    return {id, name,email};
};

const login = async (email, password) => {
    const user = await repository.findByEmail(email);
    if (!user) {
        throw new Error("Invalid email or password");
    }

    if (user.status !== "ACTIVE") {
        throw new Error("User is inactive");
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
        throw new Error("Invalid email or password");
    }
    const token = generateToken({
        id: user.id,
        email: user.email
    });

    delete user.password;

    return{ token,user};

};

module.exports = {
    register,
    login
};