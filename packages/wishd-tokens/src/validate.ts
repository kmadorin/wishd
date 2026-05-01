import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
// Import schema JSON directly — @uniswap/token-lists@1.0.0-beta.35 dist is
// missing several .js files so the named re-export crashes at runtime.
import schema from "@uniswap/token-lists/src/tokenlist.schema.json";
import type { TokenList } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validator: ValidateFunction = ajv.compile(schema);

export function validateTokenList(list: unknown): asserts list is TokenList {
  if (!validator(list)) {
    const messages = (validator.errors ?? []).map(e => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Token list failed schema validation: ${messages}`);
  }
}
