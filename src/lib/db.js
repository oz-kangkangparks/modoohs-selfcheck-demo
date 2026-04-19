import { openDB } from 'idb';

const DB_NAME = 'modoohs-selfcheck';
/**
 * DB_VERSION 2 — 2026.04.17 회의 반영 스키마 전면 교체에 따라 기존 진단 데이터 초기화
 * (v1에서 작성된 이전 answers 스키마는 새 calculator와 호환되지 않음)
 */
const DB_VERSION = 2;
const STORE_NAME = 'diagnoses';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1에서 업그레이드 시: 기존 저장소를 제거해 호환 불가능한 구 데이터 폐기
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
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

/** 전체 진단 이력 조회 (최신순) */
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

/** 진행 중 진단 찾기 (최근) */
export async function getInProgressDiagnosis() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('status');
  const results = await index.getAll('in_progress');
  if (results.length === 0) return null;
  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return results[0];
}
