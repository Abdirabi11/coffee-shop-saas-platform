import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import superRoutes from "./routes/super-admin/super_admin.auth.routes.ts"
import adminRoutes from "./routes/admin/admin.routes.ts"
import authRoutes from "./routes/auth.routes.ts"
import productRoutes from "./routes/product.routes.ts"


dotenv.config();

const app = express();
const PORT: number = Number(process.env.PORT) || 5004;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/super_admin", superRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/product", productRoutes);


app.listen(PORT, () => {
  console.log(`☕ Coffee API running on port ${PORT}`);
});
