import { openDB } from 'idb';

const DB_NAME = 'modoohs-selfcheck';
const DB_VERSION = 1;
const STORE_NAME = 'diagnoses';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('createdAt', 'createdAt');
      }
    },
  });
}

/** 진단 결과 저장/업데이트 */
export async function saveDiagnosis(diagnosis) {
  const db = await getDB();
  const record = {
    ...diagnosis,
    updatedAt: new Date().toISOString(),
    createdAt: diagnosis.createdAt || new Date().toISOString(),
  };
  await db.put(STORE_NAME, record);
  return record;
}

/** ID로 진단 결과 조회 */
export async function getDiagnosis(id) {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

/** 전체 진단 이력 조회 (최신순 정렬) */
export async function getAllDiagnoses() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** 진단 삭제 */
export async function deleteDiagnosis(id) {
  const db = await getDB();
  return db.delete(STORE_NAME, id);
}

/** 진행 중인 진단 찾기 */
export async function getInProgressDiagnosis() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('status');
  const results = await index.getAll('in_progress');
  if (results.length === 0) return null;
  // 가장 최근 것 반환
  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return results[0];
}
