const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const AppError = require("../utils/AppError");

const AVATAR_DIR = path.join(__dirname, "..", "..", "uploads", "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

const avatarUpload = multer({
    storage: multer.diskStorage({
        destination: AVATAR_DIR,
        filename: (req, file, cb) => cb(null, `${req.user.id}-${crypto.randomBytes(6).toString("hex")}${EXTENSIONS[file.mimetype]}`)
    }),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (!EXTENSIONS[file.mimetype]) {
            return cb(AppError.badRequest("Avatar must be a JPEG, PNG or WebP image", "INVALID_FILE_TYPE"));
        }
        cb(null, true);
    }
}).single("avatar");

// The browser-supplied MIME type is only a claim; check the file's real signature too.
const SIGNATURES = [
    (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    (bytes) => bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
];

const verifyImage = (req, res, next) => {
    if (!req.file) {
        return next(AppError.badRequest("Choose an image to upload", "FILE_REQUIRED"));
    }

    const handle = fs.openSync(req.file.path, "r");
    const bytes = Buffer.alloc(12);
    fs.readSync(handle, bytes, 0, 12, 0);
    fs.closeSync(handle);

    if (!SIGNATURES.some((matches) => matches(bytes))) {
        fs.unlinkSync(req.file.path);
        return next(AppError.badRequest("That file is not a valid image", "INVALID_FILE_TYPE"));
    }

    next();
};

const removeAvatarFile = (avatarUrl) => {
    if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return;
    const file = path.join(AVATAR_DIR, path.basename(avatarUrl));
    fs.promises.unlink(file).catch(() => {});
};

module.exports = {
    avatarUpload,
    verifyImage,
    removeAvatarFile
};
