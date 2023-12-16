import { SyncableExcalidrawElement, getSyncableElements } from ".";
import { ExcalidrawElement, FileId } from "../../src/element/types";
import Portal from "../collab/Portal";
import { getSceneVersion } from "../../src/element";
import { AppState } from "../../src/types";
import {
  IV_LENGTH_BYTES,
  decryptData,
  encryptData,
} from "../../src/data/encryption";
import { reconcileElements } from "../collab/reconciliation";

const _basrUrl = import.meta.env.REMOTE_STORAGE_HTTP_URL;

class HttpSceneVersionCache {
  private static cache = new WeakMap<SocketIOClient.Socket, number>();
  static get = (socket: SocketIOClient.Socket) => {
    return HttpSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: SocketIOClient.Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    HttpSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

export const isSaved = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return HttpSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToStorage = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const savedFiles = new Map<FileId, true>();
  const erroredFiles = new Map<FileId, true>();
  return { savedFiles, erroredFiles };
};

export const saveToStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSaved(portal, elements)
  ) {
    return false;
  }

  const getResponse = await fetch(`${_basrUrl}/rooms/${roomId}`);
  if (!getResponse.ok) {
    return false;
  }
  const buffer = await getResponse.arrayBuffer();

  const saveData = async (data: readonly SyncableExcalidrawElement[]) => {
    const json = JSON.stringify(elements);
    const encoded = new TextEncoder().encode(json);
    const { encryptedBuffer, iv } = await encryptData(roomKey, encoded);

    const payloadBlob = new Blob([iv.buffer, encryptedBuffer]);
    const payload = await new Response(payloadBlob).arrayBuffer();
    const putResponse = await fetch(`${_basrUrl}/rooms/${roomId}`, {
      method: "PUT",
      body: payload,
    });

    if (putResponse.ok) {
      return true;
    }

    return false;
  };

  if (buffer.byteLength === 0) {
    // not exist and save
    if (await saveData(elements)) {
      HttpSceneVersionCache.set(socket, elements);
      return { reconciledElements: null };
    }

    return false;
  }

  const prevElements = getSyncableElements(
    await getElementsFromBuffer(buffer, roomKey),
  );

  const reconciledElements = getSyncableElements(
    reconcileElements(elements, prevElements, appState),
  );

  // save
  if (await saveData(elements)) {
    HttpSceneVersionCache.set(socket, elements);
    return { reconciledElements };
  }

  return false;
};

const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly ExcalidrawElement[]> => {
  // Buffer should contain both the IV (fixed length) and encrypted data
  const iv = buffer.slice(0, IV_LENGTH_BYTES);
  const encrypted = buffer.slice(IV_LENGTH_BYTES, buffer.byteLength);
  const decrypted = await decryptData(new Uint8Array(iv), encrypted, key);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};
