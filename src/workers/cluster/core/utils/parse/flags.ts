import { guard, humanize } from '../../globalCore';
import { FlagDefinition, FlagResult, FlagResultValueSet } from '../../types';

export function flags(definitions: Iterable<FlagDefinition>, text: string, strict = false): FlagResult {
    let currentFlag: keyof FlagResult = '_';
    let currentGroup: StringRange[] = [];
    const defArr = [...definitions];
    const resultGroups: FlagResultGroups = { _: [] };
    const flagMap = new Map(defArr.map(d => [d.word, d.flag]));
    const flagKeys = new Set<string>(defArr.map(d => d.flag));

    for (const { start, end, value } of humanize.smartSplitRanges(text)) {
        if (!text.slice(start, end).startsWith('-')) {
            currentGroup.push({ start, end, value });
        } else if (value === '--') {
            if (currentFlag !== '_') {
                pushFlagGroup(resultGroups, currentFlag, currentGroup);
                currentFlag = '_';
                currentGroup = [];
            } else {
                currentGroup.push({ start, end, value });
            }
        } else if (value.startsWith('--')) {
            const flag = flagMap.get(value.slice(2));
            if (flag === undefined) {
                currentGroup.push({ start, end, value });
            } else if (currentFlag !== flag) {
                pushFlagGroup(resultGroups, currentFlag, currentGroup);
                currentFlag = flag;
                currentGroup = [];
            }
        } else if (value.startsWith('-')) {
            let flagMatched = !strict;
            for (const char of value) {
                flagMatched ||= flagKeys.has(char);
                if (guard.isLetter(char) && currentFlag !== char && (!strict || flagKeys.has(char))) {
                    flagMatched = true;
                    pushFlagGroup(resultGroups, currentFlag, currentGroup);
                    currentFlag = char;
                    currentGroup = [];
                }
            }
            if (!flagMatched)
                currentGroup.push({ start, end, value });
        } else {
            currentGroup.push({ start, end, value });
        }
    }

    pushFlagGroup(resultGroups, currentFlag, currentGroup);

    const result: Mutable<FlagResult> = { _: toFlagResultSet(text, resultGroups._) };
    for (const key of Object.keys(resultGroups))
        result[key] = toFlagResultSet(text, resultGroups[key] ?? []);

    return result;
}

type StringRange = { start: number; end: number; value: string; };
type FlagResultGroups = { -readonly [P in keyof FlagResult]: StringRange[][] }

function pushFlagGroup(groupsMap: FlagResultGroups, flag: keyof FlagResult, group: StringRange[]): void {
    const groups = groupsMap[flag] ??= [];
    if (group.length > 0)
        groups.push(group);
}

function toFlagResultSet(source: string, rangeGroups: StringRange[][]): FlagResultValueSet {
    const flatValues = rangeGroups.flat() as { [index: number]: StringRange | undefined; length: number; };
    return {
        length: flatValues.length,
        get(index: number) {
            const result = flatValues[index];
            if (result === undefined)
                return undefined;

            const start = result.start;
            const end = result.end;
            return {
                value: result.value,
                get raw() { return source.slice(start, end); }
            };
        },
        merge(...args: [] | [start: number, end?: number]) {
            const ranges = args.length === 0 ? rangeGroups : [...jaggedSlice(rangeGroups, ...args)];
            const result = [...mergeRanges(ranges, ' ')];
            return {
                value: result.map(r => r.value).join(' '),
                get raw() { return result.map(r => source.slice(r.start, r.end)).join(' '); }
            };
        },
        slice(start: number, end?: number) {
            return toFlagResultSet(source, [...jaggedSlice(rangeGroups, start, end)]);
        }
    };
}

function* jaggedSlice<T>(source: T[][], start: number, end = Infinity): Generator<T[]> {
    let j = 0;
    if (start < 0 || end < 0)
        throw new Error('Index out of range');

    for (const group of source) {
        if (j + group.length < start) {
            j += group.length;
        } else {
            yield group.slice(Math.max(start - j, 0), Math.max(end - j, 0));
            j += group.length;
        }

        if (j >= end)
            return;
    }
}

function* mergeRanges(rangeGroups: StringRange[][], join: string): Generator<StringRange> {
    for (const group of rangeGroups) {
        if (group.length === 0)
            continue;

        let { start, end, value } = group[0];
        for (let i = 1; i < group.length; i++) {
            const range = group[i];
            value += join + range.value;

            if (range.start < start)
                start = range.start;

            if (range.end > end)
                end = range.end;
        }

        yield { start, end, value };
    }
}
