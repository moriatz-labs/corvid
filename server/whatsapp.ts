import path from "node:path";
import { rmSync } from "node:fs";
import makeWASocket, {
  DisconnectReason,
  jidNormalizedUser,
  type proto,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import P from "pino";
import type { WhatsAppIntake } from "../src/shared/types.js";

type WhatsAppConnectionStatus = "idle" | "connecting" | "qr" | "connected" | "failed";

type WhatsAppSnapshot = {
  status: WhatsAppConnectionStatus;
  connected: boolean;
  qr?: string;
  qrUpdatedAt?: string;
  detail: string;
};

type MessageHandler = (intake: WhatsAppIntake) => void | Promise<void>;

const authDirectory = path.resolve(process.cwd(), ".corvin-whatsapp-auth");

let socket: WASocket | null = null;
let starting: Promise<WhatsAppSnapshot> | null = null;
let onMessage: MessageHandler | null = null;
let manualRestart = false;
let connectedNoticeSentFor: string | null = null;
let snapshot: WhatsAppSnapshot = {
  status: "idle",
  connected: false,
  detail: "WhatsApp is not connected",
};

export async function startWhatsAppConnector(handler: MessageHandler): Promise<WhatsAppSnapshot> {
  onMessage = handler;
  if (snapshot.connected || snapshot.status === "qr") {
    return snapshot;
  }
  if (starting) {
    return starting;
  }

  starting = createSocket();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export function shouldReuseWhatsAppSession(env: Record<string, string | undefined>): boolean {
  return env.CORVIN_WHATSAPP_REUSE_SESSION === "true";
}

export function shouldCaptureWhatsAppMessage(input: {
  body?: string;
  messageId?: string;
  chatId?: string;
  from?: string;
  fromMe?: boolean;
}): boolean {
  if (!input.body || !input.messageId || !input.chatId || !input.from) {
    return false;
  }

  if (!input.fromMe) {
    return true;
  }

  return isCorvinCommand(input.body);
}

export function forceNewWhatsAppPairing(): void {
  manualRestart = true;
  socket?.end(new Error("Starting a fresh WhatsApp pairing session"));
  socket = null;
  starting = null;
  connectedNoticeSentFor = null;
  rmSync(authDirectory, { recursive: true, force: true });
  snapshot = {
    status: "idle",
    connected: false,
    detail: "Start WhatsApp pairing to show a new QR",
  };
  manualRestart = false;
}

export function getWhatsAppSnapshot(): WhatsAppSnapshot {
  return snapshot;
}

export async function refreshWhatsAppConnector(handler: MessageHandler): Promise<WhatsAppSnapshot> {
  onMessage = handler;
  forceNewWhatsAppPairing();
  return startWhatsAppConnector(handler);
}

export async function sendWhatsAppMessage(chatId: string, text: string) {
  if (!socket || !snapshot.connected) {
    throw new Error("WhatsApp is not connected");
  }

  await socket.sendMessage(chatId, { text });
}

async function createSocket(): Promise<WhatsAppSnapshot> {
  snapshot = {
    status: "connecting",
    connected: false,
    detail: "Starting WhatsApp connection",
  };

  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  socket = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", (update) => {
    if (update.qr) {
      snapshot = {
        status: "qr",
        connected: false,
        qr: update.qr,
        qrUpdatedAt: new Date().toISOString(),
        detail: "Scan the QR code in WhatsApp",
      };
    }

    if (update.connection === "open") {
      snapshot = {
        status: "connected",
        connected: true,
        detail: "WhatsApp is connected",
      };
      void sendConnectedNotice();
    }

    if (update.connection === "close") {
      const statusCode = Number((update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode);
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      snapshot = {
        status: loggedOut ? "failed" : "idle",
        connected: false,
        detail: loggedOut ? "WhatsApp session ended" : "WhatsApp connection closed",
      };
      socket = null;
      if (!loggedOut && !manualRestart && onMessage) {
        void startWhatsAppConnector(onMessage);
      }
    }
  });

  socket.ev.on("messages.upsert", ({ messages }) => {
    for (const message of messages) {
      const body = extractText(message.message);
      const messageId = message.key.id;
      const chatId = message.key.remoteJid;
      const from = message.key.participant?.split("@")[0] ?? chatId?.split("@")[0];
      const fromMe = message.key.fromMe === true;
      if (!body || !messageId || !chatId || !from) {
        continue;
      }

      if (!shouldCaptureWhatsAppMessage({ body, messageId, chatId, from, fromMe })) {
        continue;
      }

      void onMessage?.({
        from,
        chatId,
        messageId,
        text: body,
        workspaceHint: extractWorkspaceHint(body),
      });
    }
  });

  return snapshot;
}

async function sendConnectedNotice() {
  const selfJid = socket?.user?.id ? jidNormalizedUser(socket.user.id) : undefined;
  if (!socket || !selfJid || connectedNoticeSentFor === selfJid) {
    return;
  }

  connectedNoticeSentFor = selfJid;
  await socket.sendMessage(selfJid, { text: "Connected" });
}

function extractText(message: proto.IMessage | null | undefined): string | undefined {
  return message?.conversation?.trim() || message?.extendedTextMessage?.text?.trim();
}

function extractWorkspaceHint(text: string): string | undefined {
  const match = text.match(/\bcorvin\s+([\w-]+)\s*:/i);
  return match?.[1];
}

function isCorvinCommand(text: string): boolean {
  const normalized = text.trim();
  if (!/^corvin\b/i.test(normalized)) {
    return false;
  }

  return !/^corvin\s+captured\b/i.test(normalized);
}
