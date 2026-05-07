import { Router, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import {
  buildClaimEggPassTransaction,
  readEggPass,
  type EggPassClaim,
} from "../lib/solana.js";

const router = Router();

type PassportEligibility = {
  eligible: boolean;
  tier: number;
  reason: string;
  stats: {
    runsCompleted: number;
    bestHops: number;
    averageHops: number;
    successfulCashouts: number;
    consistencyScore: number;
    highestCheckpointCashedOut: number;
    checkpointCashouts: Record<string, number>;
  };
};

type PassportRequirement = {
  key: string;
  label: string;
  current: number;
  target: number;
  met: boolean;
};

type PassportProgression = {
  currentTier: number;
  currentTierLabel: string;
  nextTier: number | null;
  nextTierLabel: string | null;
  progressLabel: string;
  percentToNextTier: number;
  requirements: PassportRequirement[];
  stats: PassportEligibility["stats"];
};

type TierRule = {
  tier: number;
  label: string;
  checkpoint: number;
  requiredCashouts: number;
};

const CHECKPOINT_ROW_INTERVAL = 40;

const TIER_RULES: TierRule[] = [
  { tier: 1, label: "Verified Runner", checkpoint: 2, requiredCashouts: 4 },
  { tier: 2, label: "Disciplined Player", checkpoint: 4, requiredCashouts: 6 },
  { tier: 3, label: "Elite Survivor", checkpoint: 6, requiredCashouts: 8 },
  { tier: 4, label: "Egg Oracle", checkpoint: 8, requiredCashouts: 10 },
];

const TIER_LABELS = new Map<number, string>([
  [0, "Rookie"],
  ...TIER_RULES.map((rule) => [rule.tier, rule.label] as const),
]);

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countCheckpointCashouts(
  rows: Array<{ max_row_reached: unknown; status: unknown }>,
) {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    if (String(row.status ?? "") !== "CASHED_OUT") continue;

    const hops = toFiniteNumber(row.max_row_reached);
    const checkpoint = Math.floor(hops / CHECKPOINT_ROW_INTERVAL);
    if (checkpoint <= 0) continue;

    counts[String(checkpoint)] = (counts[String(checkpoint)] ?? 0) + 1;
  }

  return counts;
}

function countCashoutsAtOrAbove(
  checkpointCashouts: Record<string, number>,
  checkpoint: number,
) {
  return Object.entries(checkpointCashouts).reduce((sum, [cp, count]) => {
    return Number(cp) >= checkpoint ? sum + count : sum;
  }, 0);
}

function computeTierFromCheckpointCashouts(
  checkpointCashouts: Record<string, number>,
) {
  let tier = 0;

  for (const rule of TIER_RULES) {
    const qualifiedCashouts = countCashoutsAtOrAbove(
      checkpointCashouts,
      rule.checkpoint,
    );

    if (qualifiedCashouts >= rule.requiredCashouts) {
      tier = rule.tier;
    }
  }

  return tier;
}

function buildProgression(
  stats: PassportEligibility["stats"],
  currentTier: number,
): PassportProgression {
  const nextRule = TIER_RULES.find((rule) => rule.tier > currentTier) ?? null;

  if (!nextRule) {
    return {
      currentTier,
      currentTierLabel: TIER_LABELS.get(currentTier) ?? `Tier ${currentTier}`,
      nextTier: null,
      nextTierLabel: null,
      progressLabel: "Top passport tier unlocked.",
      percentToNextTier: 100,
      requirements: [],
      stats,
    };
  }

  const qualifiedCashouts = countCashoutsAtOrAbove(
    stats.checkpointCashouts,
    nextRule.checkpoint,
  );
  const progressCurrent = Math.min(
    qualifiedCashouts,
    nextRule.requiredCashouts,
  );
  const percentToNextTier = Math.round(
    (progressCurrent / nextRule.requiredCashouts) * 100,
  );

  return {
    currentTier,
    currentTierLabel: TIER_LABELS.get(currentTier) ?? `Tier ${currentTier}`,
    nextTier: nextRule.tier,
    nextTierLabel: nextRule.label,
    progressLabel: `${progressCurrent}/${nextRule.requiredCashouts} cashouts at checkpoint ${nextRule.checkpoint}+ to unlock Tier ${nextRule.tier}.`,
    percentToNextTier,
    requirements: [
      {
        key: `cashout_cp_${nextRule.checkpoint}`,
        label: `Cash out at checkpoint ${nextRule.checkpoint}+ ${nextRule.requiredCashouts} times`,
        current: progressCurrent,
        target: nextRule.requiredCashouts,
        met: progressCurrent >= nextRule.requiredCashouts,
      },
    ],
    stats,
  };
}

async function evaluateEligibility(walletAddress: string): Promise<PassportEligibility> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("max_row_reached, status")
    .eq("wallet_address", walletAddress)
    .in("status", ["CRASHED", "CASHED_OUT"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const runsCompleted = rows.length;
  const hops = rows.map((row) => toFiniteNumber(row.max_row_reached));
  const bestHops = hops.length ? Math.max(...hops) : 0;
  const averageHops =
    hops.length > 0
      ? hops.reduce((acc, value) => acc + value, 0) / hops.length
      : 0;
  const successfulCashouts = rows.filter(
    (row) => String(row.status ?? "") === "CASHED_OUT",
  ).length;
  const qualifiedRuns = hops.filter((hop) => hop >= CHECKPOINT_ROW_INTERVAL)
    .length;
  const consistencyScore =
    runsCompleted > 0 ? Math.round((qualifiedRuns / runsCompleted) * 100) : 0;
  const checkpointCashouts = countCheckpointCashouts(rows);
  const highestCheckpointCashedOut = Object.keys(checkpointCashouts).length
    ? Math.max(...Object.keys(checkpointCashouts).map((value) => Number(value)))
    : 0;
  const tier = computeTierFromCheckpointCashouts(checkpointCashouts);
  const stats = {
    runsCompleted,
    bestHops,
    averageHops,
    successfulCashouts,
    consistencyScore,
    highestCheckpointCashedOut,
    checkpointCashouts,
  };

  if (tier === 0) {
    const tierOneRule = TIER_RULES[0];
    const tierOneCashouts = countCashoutsAtOrAbove(
      checkpointCashouts,
      tierOneRule.checkpoint,
    );

    return {
      eligible: false,
      tier: 0,
      reason: `Cash out at checkpoint ${tierOneRule.checkpoint}+ ${tierOneRule.requiredCashouts} times to unlock Tier 1. Current progress: ${tierOneCashouts}/${tierOneRule.requiredCashouts}.`,
      stats,
    };
  }

  return {
    eligible: true,
    tier,
    reason: `Eligible to claim EggPass Tier ${tier}.`,
    stats,
  };
}

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

async function readPassportOnchain(walletAddress: string) {
  if (!env.PROGRAM_ID || !isValidPubkey(walletAddress)) {
    return {
      configured: false,
      valid: false,
      tier: 0,
      issuedAt: 0,
      expiry: 0,
      revoked: false,
    };
  }

  try {
    const player = new PublicKey(walletAddress);
    const eggPass = await readEggPass(player);

    if (!eggPass) {
      return {
        configured: true,
        valid: false,
        tier: 0,
        issuedAt: 0,
        expiry: 0,
        revoked: false,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const valid = !eggPass.revoked && eggPass.expiry > now && eggPass.tier > 0;

    return {
      configured: true,
      valid,
      tier: eggPass.tier,
      issuedAt: eggPass.issuedAt,
      expiry: eggPass.expiry,
      revoked: eggPass.revoked,
    };
  } catch (error) {
    console.error("❌ Failed to read EggPass on-chain:", error);
    return {
      configured: true,
      valid: false,
      tier: 0,
      issuedAt: 0,
      expiry: 0,
      revoked: false,
    };
  }
}

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.walletAddress!;
    const [eligibility, passport] = await Promise.all([
      evaluateEligibility(walletAddress),
      readPassportOnchain(walletAddress),
    ]);
    const effectiveTier = passport.valid
      ? Math.max(Number(passport.tier ?? 0), eligibility.tier)
      : eligibility.tier;
    const progression = buildProgression(eligibility.stats, effectiveTier);

    res.json({
      walletAddress,
      eligibility,
      passport,
      progression,
    });
  } catch (error) {
    console.error("❌ Passport status error:", error);
    res.status(500).json({ error: "Failed to load passport status." });
  }
});

/**
 * Returns a backend-signed `claim_egg_pass` transaction (base64) for the
 * player's wallet to co-sign and submit. The backend signer attests to the
 * eligibility numbers; the player wallet authorizes the on-chain claim.
 */
router.post("/issue-signature", requireAuth, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.walletAddress!;

    if (!env.PROGRAM_ID) {
      res.status(400).json({
        error: "PROGRAM_ID belum dikonfigurasi di backend env.",
      });
      return;
    }
    if (!isValidPubkey(walletAddress)) {
      res.status(400).json({ error: "Invalid Solana wallet address." });
      return;
    }

    const eligibility = await evaluateEligibility(walletAddress);
    if (!eligibility.eligible || eligibility.tier <= 0) {
      res.status(400).json({
        error: eligibility.reason,
        eligibility,
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const passportExpiry = now + env.PASSPORT_VALIDITY_SECONDS;
    const signatureExpiry = now + env.PASSPORT_SIGNATURE_TTL_SECONDS;

    const stats = eligibility.stats.checkpointCashouts;
    const cp2 = countCashoutsAtOrAbove(stats, 2);
    const cp4 = countCashoutsAtOrAbove(stats, 4);
    const cp6 = countCashoutsAtOrAbove(stats, 6);
    const cp8 = countCashoutsAtOrAbove(stats, 8);

    const claim: EggPassClaim = {
      tier: eligibility.tier,
      highestCheckpoint: eligibility.stats.highestCheckpointCashedOut,
      cp2Cashouts: Math.min(65535, cp2),
      cp4Cashouts: Math.min(65535, cp4),
      cp6Cashouts: Math.min(65535, cp6),
      cp8Cashouts: Math.min(65535, cp8),
      reputationScore: Math.max(1, Math.min(65535, eligibility.stats.successfulCashouts * 100 + eligibility.stats.consistencyScore)),
      issuedAt: BigInt(now),
      expiry: BigInt(passportExpiry),
      nonce: randomBytes(32),
    };

    const player = new PublicKey(walletAddress);
    const unsignedTx = await buildClaimEggPassTransaction(player, claim);

    res.json({
      success: true,
      unsignedTx,
      claim: {
        player: walletAddress,
        tier: claim.tier,
        highestCheckpoint: claim.highestCheckpoint,
        cp2Cashouts: claim.cp2Cashouts,
        cp4Cashouts: claim.cp4Cashouts,
        cp6Cashouts: claim.cp6Cashouts,
        cp8Cashouts: claim.cp8Cashouts,
        reputationScore: claim.reputationScore,
        issuedAt: claim.issuedAt.toString(),
        expiry: claim.expiry.toString(),
        nonce: claim.nonce.toString("hex"),
      },
      signingDomain: {
        cluster: env.SOLANA_CLUSTER,
        program: env.PROGRAM_ID,
      },
      signatureExpiry,
      eligibility,
    });
  } catch (error) {
    console.error("❌ Passport claim issue error:", error);
    res.status(500).json({ error: "Failed to issue passport claim." });
  }
});

export default router;
