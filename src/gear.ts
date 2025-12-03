import type { GearApi, HexString } from "@gear-js/api";
import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { Program, Service } from "./vft";

export const fungibleTokenProgramID = process.env.VFT_PROGRAM_ID!;

export const toHexAddress = (addr: string): HexString => {
  try {
    if (addr?.startsWith("0x") && addr.length > 2) return addr as HexString;
    const decoded = decodeAddress(addr);
    return u8aToHex(decoded) as HexString;
  } catch {
    console.warn("[toHexAddress] Error:", addr);
    return addr as HexString;
  }
};


export const getVFTBalance = async (
  accountAddress: string,
  api: GearApi
): Promise<number> => {
  if (!accountAddress || !api) {
    console.warn("Account Error");
    return 0;
  }

  try {
    const program = new Program(api, fungibleTokenProgramID as HexString);
    const svc = new Service(program);
    const normalized = toHexAddress(accountAddress);

    const result = await svc.balanceOf(normalized);
    const balance = Number(result);

    if (isNaN(balance)) {
      console.warn("[getVFTBalance]:", result);
      return 0;
    }

    return balance;
  } catch (error) {
    console.error("[getVFTBalance] Balance Error:", error);
    return 0;
  }
};
