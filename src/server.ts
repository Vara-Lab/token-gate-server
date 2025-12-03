import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import jwt from "jsonwebtoken";
import { GearApi } from "@gear-js/api";

import {
  extractLine,
  issueNonce,
  consumeNonce,
  verifySignature,
  signJwt,
  SignedMessageSchema,
} from "./auth";
import { getVFTBalance } from "./gear";


const PORT = 3000; 
const JWT_SECRET = mustEnv("JWT_SECRET");
const VARA_WS = mustEnv("VARA_WS");
const EXPECTED_DOMAIN = process.env.EXPECTED_DOMAIN || "";
const EXPECTED_CHAIN_ID = process.env.EXPECTED_CHAIN_ID || "";

const VFT_DECIMALS = intEnv("VFT_DECIMALS", 0);
const VFT_THRESHOLD_HUMAN = intEnv("VFT_THRESHOLD", 3000); 
const NONCE_TTL = intEnv("NONCE_TTL_SEC", 600);
const JWT_TTL_MIN = intEnv("JWT_TTL_MIN", 20);

const CLOCK_SKEW_MS = intEnv("CLOCK_SKEW_MS", 2 * 60 * 1000); 

const REFRESH_MIN_REMAIN_SEC = intEnv("REFRESH_MIN_REMAIN_SEC", 300); 
const RECHECK_ON_REFRESH = (process.env.RECHECK_ON_REFRESH ?? "true").toLowerCase() === "true";


const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS Error"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));


let gearApi: GearApi | null = null;
async function getApi(): Promise<GearApi> {
  if (gearApi) return gearApi;
  gearApi = await GearApi.create({ providerAddress: VARA_WS });

  gearApi?.provider?.on?.("error", (e: any) => console.error("[GearApi] provider error:", e));
  gearApi?.provider?.on?.("disconnected", () => console.warn("[GearApi] disconnected"));
  gearApi?.provider?.on?.("connected", () => console.log("[GearApi] connected"));

  return gearApi;
}


app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    time: new Date().toISOString(),
    rpc: VARA_WS,
  })
);

// 1) Nonce
app.post("/auth/nonce", (_req, res) => {
  const nonce = issueNonce(NONCE_TTL);
  return res.json({ nonce, expiresIn: NONCE_TTL });
});

// 2) Verify
app.post("/auth/verify", async (req, res) => {
  try {
    const { address, message, signature } = SignedMessageSchema.parse(req.body);

    const nonce = mustExtract(message, "Nonce");
    const domain = mustExtract(message, "Domain");
    const chainId = mustExtract(message, "ChainId");
    const issuedAt = mustExtract(message, "IssuedAt");
    const expiresIn = mustExtract(message, "ExpiresIn");

    if (!consumeNonce(nonce)) {
      return sendError(res, 400, "Invalid Nonce");
    }
    if (EXPECTED_DOMAIN && domain !== EXPECTED_DOMAIN) {
      return sendError(res, 400, "Invalid domain");
    }
    if (EXPECTED_CHAIN_ID && chainId !== EXPECTED_CHAIN_ID) {
      return sendError(res, 400, "Invalid chainId");
    }
    if (!isMessageFresh(issuedAt, expiresIn, CLOCK_SKEW_MS)) {
      return sendError(res, 400, "Message Error");
    }

   
    if (!verifySignature(address, message, signature)) {
      return sendError(res, 401, "firma inválida");
    }

   
    const api = await getApi();
    const balRawNumber: number = await getVFTBalance(address, api); 

    const thresholdRaw = BigInt(VFT_THRESHOLD_HUMAN) * (10n ** BigInt(VFT_DECIMALS));

   
    const balRawInt = toSafeBigInt(balRawNumber);

    if (balRawInt < thresholdRaw) {
      const human = toHuman(balRawInt, VFT_DECIMALS);
      const humanThreshold = toHuman(thresholdRaw, VFT_DECIMALS);
      return res.status(403).json({
        error: "gating: balance insuficiente",
        balance: human,
        threshold: humanThreshold,
        decimals: VFT_DECIMALS,
      });
    }

    const token = signJwt(address, JWT_TTL_MIN, JWT_SECRET);

    const human = toHuman(balRawInt, VFT_DECIMALS);
    const humanThreshold = toHuman(thresholdRaw, VFT_DECIMALS);

    return res.json({
      jwt: token,
      balance: human,
      threshold: humanThreshold,
      decimals: VFT_DECIMALS,
    });
  } catch (e: any) {
    console.error("[/auth/verify] error:", e?.stack || e?.message || e);
    return sendError(res, 400, e?.message ?? "Bad request");
  }
});

// JWT Refresh
app.post("/auth/refresh", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) return sendError(res, 401, "falta token");

   
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string; hasAccess?: boolean; iat?: number; exp?: number;
    };

    const remain = secondsUntil(payload.exp);
    if (remain > REFRESH_MIN_REMAIN_SEC) {
      return res.status(200).json({
        jwt: token,
        remainingSec: remain,
        refreshed: false,
      });
    }

    if (RECHECK_ON_REFRESH) {
      const api = await getApi();
      const balRawNumber: number = await getVFTBalance(payload.sub, api);
      const thresholdRaw = BigInt(VFT_THRESHOLD_HUMAN) * (10n ** BigInt(VFT_DECIMALS));
      const balRawInt = toSafeBigInt(balRawNumber);

      if (balRawInt < thresholdRaw) {
        const human = toHuman(balRawInt, VFT_DECIMALS);
        const humanThreshold = toHuman(thresholdRaw, VFT_DECIMALS);
        return res.status(403).json({
          error: "gating: Insuficient Balance (refresh)",
          balance: human,
          threshold: humanThreshold,
          decimals: VFT_DECIMALS,
        });
      }
    }

    const newJwt = signJwt(payload.sub, JWT_TTL_MIN, JWT_SECRET);
    return res.json({
      jwt: newJwt,
      remainingSec: secondsUntil((jwt.decode(newJwt) as any)?.exp),
      refreshed: true,
    });
  } catch {
    return sendError(res, 401, "Invalid token");
  }
});


app.get("/entitlement", (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return sendError(res, 401, "Token Error");
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return res.json({ ok: true, address: payload.sub, hasAccess: payload.hasAccess });
  } catch {
    return sendError(res, 401, "Invalid token");
  }
});


const server = app.listen(PORT, () => {
  console.log(`token-gate-server runnig :${PORT}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
function shutdown() {
  console.log("Cerrando servidor...");
  server.close(() => {
    console.log("HTTP cerrado.");
    process.exit(0);
  });
}


function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`ENV faltante: ${key}`);
  return v;
}

function intEnv(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function mustExtract(message: string, key: string): string {
  const v = extractLine(message, key);
  if (!v) throw new Error(`Error: ${key}`);
  return v;
}


function isMessageFresh(issuedAt: string, expiresIn: string, skewMs: number): boolean {
  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued)) return false;
  const now = Date.now();
  const durMs = parseDurationMs(expiresIn);
  if (durMs <= 0) return false;
  return now >= issued - skewMs && now <= issued + durMs + skewMs;
}

function parseDurationMs(s: string): number {
  const m = String(s).trim().match(/^(\d+)\s*([smh])?$/i);
  if (!m) return 0;
  const val = Number(m[1]);
  const unit = (m[2] || "s").toLowerCase();
  switch (unit) {
    case "s": return val * 1000;
    case "m": return val * 60 * 1000;
    case "h": return val * 60 * 60 * 1000;
    default: return 0;
  }
}

function toSafeBigInt(n: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  if (Math.abs(n) > Number.MAX_SAFE_INTEGER) {
    console.warn("[toSafeBigInt] Error:", n);
  }
  return BigInt(Math.trunc(n));
}

function toHuman(v: bigint, decimals: number): number {
  if (decimals <= 0) return Number(v);
  const denom = 10 ** Math.min(decimals, 15);
  const res = Number(v) / denom;
  if (decimals > 15) {
    const scaleLeft = 10 ** (decimals - 15);
    return res / scaleLeft;
  }
  return res;
}

function sendError(res: express.Response, code: number, error: string) {
  return res.status(code).json({ error });
}

function getBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function secondsUntil(exp?: number): number {
  if (!exp) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec;
}
