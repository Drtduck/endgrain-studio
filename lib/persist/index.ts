export { CURRENT_SCHEMA_VERSION, designSchema, migrate, migrations, parseDesign } from './schema'
export {
  LS_CURRENT_KEY,
  decodeDesignFromHash,
  deserializeDesign,
  encodeDesignToHash,
  fromCompact,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeDesign,
  toCompact,
} from './codec'
