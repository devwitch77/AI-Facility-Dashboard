// server/auth.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
};

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};

export const checkRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};
