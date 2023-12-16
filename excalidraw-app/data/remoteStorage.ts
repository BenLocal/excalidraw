import { SyncableExcalidrawElement } from ".";
import { ExcalidrawElement, FileId } from "../../src/element/types";
import { AppState, BinaryFileData } from "../../src/types";
import Portal from "../collab/Portal";
import {
  isSavedToFirebase,
  loadFilesFromFirebase,
  loadFromFirebase,
  saveFilesToFirebase,
  saveToFirebase,
} from "./firebase";
import { isSaved, saveFilesToStorage, saveToStorage } from "./httpStorage";

type isSavedToStorageFn = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
) => boolean;

type saveFilesToStorageFn = ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => Promise<{
  savedFiles: Map<FileId, true>;
  erroredFiles: Map<FileId, true>;
}>;

type saveToStorageFn = (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => Promise<
  false | { reconciledElements: SyncableExcalidrawElement[] | null }
>;

type loadFromStorageFn = (
  roomId: string,
  roomKey: string,
  socket: SocketIOClient.Socket | null,
) => Promise<readonly ExcalidrawElement[] | null>;

type loadFilesFromStorageFn = (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => Promise<{
  loadedFiles: BinaryFileData[];
  erroredFiles: Map<FileId, true>;
}>;

export interface RemoteStorage {
  isSavedToStorage: isSavedToStorageFn;
  saveFilesToStorage: saveFilesToStorageFn;
  saveToStorage: saveToStorageFn;
  loadFromStorage: loadFromStorageFn;
  loadFilesFromStorage: loadFilesFromStorageFn;
}

const _firebase: RemoteStorage = {
  isSavedToStorage: isSavedToFirebase,
  saveFilesToStorage: saveFilesToFirebase,
  saveToStorage: saveToFirebase,
  loadFromStorage: loadFromFirebase,
  loadFilesFromStorage: loadFilesFromFirebase,
};

const _http: RemoteStorage = {
  isSavedToStorage: isSaved,
  saveFilesToStorage,
  saveToStorage,
  loadFromStorage(
    roomId: string,
    roomKey: string,
    socket: SocketIOClient.Socket | null,
  ): Promise<readonly ExcalidrawElement[] | null> {
    throw new Error("Function not implemented.");
  },
  loadFilesFromStorage(
    prefix: string,
    decryptionKey: string,
    filesIds: readonly FileId[],
  ): Promise<{
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  }> {
    throw new Error("Function not implemented.");
  },
};

export const getRemoteStorage = () => {
  const type = import.meta.env.REMOTE_STORAGE_TYPE;
  if (type === "http") {
    return _http;
  }
  return _firebase;
};
