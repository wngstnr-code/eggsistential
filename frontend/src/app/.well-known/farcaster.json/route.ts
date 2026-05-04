import { NextResponse } from "next/server";

const APP_URL = "https://eggsecutive.vercel.app";
const APP_NAME = "Eggsecutive";
const APP_ICON = `${APP_URL}/images/1.png`;
const APP_IMAGE = `${APP_URL}/images/1.png`;
const APP_SPLASH_BG = "#0a1428";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    // Replace with values signed at https://farcaster.xyz/~/developers/mini-apps
    // (Manage > Domain) once the production URL is final.
    accountAssociation: {
      header: "",
      payload: "",
      signature: "",
    },
    frame: {
      version: "1",
      name: APP_NAME,
      iconUrl: APP_ICON,
      homeUrl: APP_URL,
      imageUrl: APP_IMAGE,
      buttonTitle: "Play Eggsecutive",
      splashImageUrl: APP_ICON,
      splashBackgroundColor: APP_SPLASH_BG,
      webhookUrl: `${APP_URL}/api/webhook`,
    },
  });
}

