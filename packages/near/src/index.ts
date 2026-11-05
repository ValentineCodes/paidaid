export { readNearConfig, readNearPublicConfig } from "./config";
export { createProvider, viewMethod } from "./rpc";
export {
  buildSetMessageCall,
  extractTransactionHash,
  getMessage,
  getTotalMessages,
  requireContractId,
  type SetMessageCall,
} from "./core-contract";
export {
  normalizeAccountId,
  validateAccountId,
  validateMessage,
} from "./validation";
