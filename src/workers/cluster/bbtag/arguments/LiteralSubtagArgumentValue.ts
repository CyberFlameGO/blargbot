import { Statement, SubtagArgumentValue } from '@cluster/types';

export class LiteralSubtagArgumentValue implements SubtagArgumentValue {
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    readonly #value: string;
    public readonly isCached = true;
    public get value(): string { return this.#value; }
    public get code(): Statement { return [this.#value]; }
    public get raw(): string { return this.#value; }
    public constructor(value: string) {
        this.#value = value;
    }
    public wait(): Promise<string> {
        return Promise.resolve(this.#value);
    }
    public execute(): Promise<string> {
        return Promise.resolve(this.#value);
    }
}