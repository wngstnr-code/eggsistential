"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  House,
  Play as PlayIcon,
  Trophy,
  WalletCards,
} from "lucide-react";
import { useWallet } from "~/components/web3/WalletProvider";

function shortAddress(address: string, isMobile: boolean = false) {
  if (!address) return "NO WALLET";
  if (isMobile) {
