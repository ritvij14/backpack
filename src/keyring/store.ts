import { PublicKey } from "@solana/web3.js";
import { BrowserRuntime } from "../common/browser";
import * as crypto from "./crypto";
import { DerivationPath } from "./crypto";
import { HdKeyring, Keyring } from ".";
import {
  NotificationsClient,
  NOTIFICATION_KEYRING_STORE_LOCKED,
  NOTIFICATION_KEYRING_STORE_UNLOCKED,
} from "../common";

const LOCK_INTERVAL_SECS = 15 * 60 * 1000;

export class KeyringStore {
  private notifications: NotificationsClient;
  private lastUsedTs: number;
  private hdKeyring?: HdKeyring;
  private importedKeyring?: Keyring;

  constructor(notifications: NotificationsClient) {
    this.notifications = notifications;
    this.lastUsedTs = 0;

    // Check the last time the keystore was used at a regular interval.
    // If it hasn't been used recently, lock the keystore.
    const interval = setInterval(() => {
      const currentTs = Date.now() / 1000;
      if (currentTs - this.lastUsedTs >= LOCK_INTERVAL_SECS) {
        this.lock();
        notifications.pushNotification({
          name: NOTIFICATION_KEYRING_STORE_LOCKED,
        });
        clearInterval(interval);
      }
    }, LOCK_INTERVAL_SECS);
  }

  public async state(): Promise<KeyringStoreState> {
    if (this.isUnlocked()) {
      return KeyringStoreStateEnum.Unlocked;
    }
    if (await this.isLocked()) {
      return KeyringStoreStateEnum.Locked;
    }
    return KeyringStoreStateEnum.NeedsOnboarding;
  }

  public publicKeys(): Array<PublicKey> {
    if (!this.isUnlocked()) {
      throw new Error("keyring store is not unlocked");
    }
    const pubkeys = this.hdKeyring!.publicKeys();
    return pubkeys.concat(this.importedKeyring!.publicKeys());
  }

  public lock() {
    this.hdKeyring = undefined;
    this.importedKeyring = undefined;
    this.lastUsedTs = 0;
    this.notifications.pushNotification({
      name: NOTIFICATION_KEYRING_STORE_LOCKED,
    });
  }

  public async tryUnlock(password: string) {
    if (this.isUnlocked()) {
      throw new Error("unable to unlock");
    }
    const ciphertextPayload = await LocalStorageDb.get(KEY_KEYRING_STORE);
    if (ciphertextPayload === undefined || ciphertextPayload === null) {
      throw new Error("keyring store not found on disk");
    }
    const plaintext = await crypto.decrypt(ciphertextPayload, password);
    const { hdKeyring, importedKeyring, lastUsedTs: _ } = JSON.parse(plaintext);

    this.updateLastUsed();
    this.hdKeyring = HdKeyring.fromJson(hdKeyring);
    this.importedKeyring = Keyring.fromJson(importedKeyring);

    this.notifications.pushNotification({
      name: NOTIFICATION_KEYRING_STORE_UNLOCKED,
    });
  }

  public async init(
    mnemonic: string,
    derivationPath: DerivationPath,
    password: string
  ) {
    if (this.isUnlocked()) {
      throw new Error("unable to initialize");
    }

    // Initialize keyrings.
    this.hdKeyring = HdKeyring.fromMnemonic(mnemonic, derivationPath);
    this.importedKeyring = Keyring.fromImports([]);
    this.updateLastUsed();

    // Persist the store.
    this.persistEncrypted(password);
  }

  public updateLastUsed() {
    this.lastUsedTs = Date.now() / 1000;
  }

  private async persistEncrypted(password: string) {
    // Serialize the encrypted payload.
    const plaintext = JSON.stringify(this.toJson());
    const ciphertext = await crypto.encrypt(plaintext, password);

    // Persist the store.
    LocalStorageDb.set(KEY_KEYRING_STORE, ciphertext);
  }

  private toJson(): any {
    if (!this.hdKeyring || !this.importedKeyring) {
      throw new Error("keyring store is locked");
    }
    return {
      hdKeyring: this.hdKeyring.toJson(),
      importedKeyring: this.importedKeyring.toJson(),
      lastUsedTs: this.lastUsedTs,
    };
  }

  private isUnlocked(): boolean {
    return (
      this.hdKeyring !== undefined ||
      this.importedKeyring !== undefined ||
      this.lastUsedTs !== 0
    );
  }

  private async isLocked(): Promise<boolean> {
    if (this.isUnlocked()) {
      return false;
    }
    const ciphertext = await LocalStorageDb.get(KEY_KEYRING_STORE);
    return ciphertext !== undefined && ciphertext !== null;
  }
}

// Keys used by the local storage db.
export const KEY_KEYRING_STORE = "keyring-store";
export const KEY_CONNECTION_URL = "connection-url";

export class LocalStorageDb {
  static async get(key: string): Promise<any> {
    return await BrowserRuntime.getLocalStorage(key);
  }

  static async set(key: string, value: any): Promise<void> {
    await BrowserRuntime.setLocalStorage(key, value);
  }
}

export const KeyringStoreStateEnum: { [key: string]: KeyringStoreState } = {
  Locked: "locked",
  Unlocked: "unlocked",
  NeedsOnboarding: "needs-onboarding",
};
export type KeyringStoreState = "locked" | "unlocked" | "needs-onboarding";