import { TypeMappingResult } from '@core/types';

import { result } from './result';

export function mapJObject(value: unknown): TypeMappingResult<JObject> {
    switch (typeof value) {
        case 'object':
            if (!Array.isArray(value) && value !== null)
                return { valid: true, value: value as JObject };
        // fallthrough
        case 'bigint':
        case 'boolean':
        case 'function':
        case 'number':
        case 'string':
        case 'symbol':
        case 'undefined': return result.never;
    }
}