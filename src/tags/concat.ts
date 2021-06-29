import { Cluster } from '../cluster';
import { BaseSubtag } from '../core/bbtag';
import { SubtagType, bbtagUtil } from '../utils';

export class ConcatSubtag extends BaseSubtag {
    public constructor(cluster: Cluster) {
        super(cluster, {
            name: 'concat',
            category: SubtagType.ARRAY,
            definition: [
                {
                    parameters: ['values+'],
                    description:
                        'Takes `values` and joins them together to form a single array. If `values` is an array, it\'s flattened into the resulting array.',
                    exampleCode: 'Two arrays: {concat;["this", "is"];["an", "array"]}\nStrings and an array: {concat;a;b;c;[1, 2, 3]}',
                    exampleOut: 'Two arrays: ["this","is","an","array"]\nStrings and an array: ["a","b","c", 1, 2, 3]',
                    execute: (_, args) => this.concatArrays(args.map((arg) => arg.value))
                }
            ]
        });
    }

    public concatArrays(values: string[]): string {
        const parsedArray = values.map((value) => {
            try {
                value = JSON.parse(value);
            } catch(e) { }
            return value;
        });
        const flattenedArray = bbtagUtil.tagArray.flattenArray(parsedArray);
        return JSON.stringify(flattenedArray);
    }
}