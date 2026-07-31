/* Almacenamiento local compartido entre la página y el service worker.
   "files" → clave "appId/ruta", valor Blob (los archivos de cada app)
   "meta"  → registro de apps instaladas */
(function (global) {
  const DB_NAME = "nexo-db";
  const DB_VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function done(tx, db) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function read(request, db) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  global.NexoIDB = {
    async putFile(key, blob) {
      const db = await open();
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(blob, key);
      return done(tx, db);
    },

    async getFile(key) {
      const db = await open();
      return read(db.transaction("files").objectStore("files").get(key), db);
    },

    async deleteFilesByPrefix(prefix) {
      const db = await open();
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const keys = await new Promise((res, rej) => {
        const rq = store.getAllKeys(IDBKeyRange.bound(prefix + "/", prefix + "/\uffff"));
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      keys.forEach((k) => store.delete(k));
      return done(tx, db);
    },

    async putMeta(record) {
      const db = await open();
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(record);
      return done(tx, db);
    },

    async getMeta(id) {
      const db = await open();
      return read(db.transaction("meta").objectStore("meta").get(id), db);
    },

    async getAllMeta() {
      const db = await open();
      return read(db.transaction("meta").objectStore("meta").getAll(), db);
    },

    async deleteMeta(id) {
      const db = await open();
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").delete(id);
      return done(tx, db);
    },
  };
})(typeof self !== "undefined" ? self : this);
