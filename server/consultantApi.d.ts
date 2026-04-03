export declare function handleConsultantInterpretRequest(request: {
    method?: string;
    on: (event: string, cb: (chunk?: Uint8Array | string) => void) => void;
}, response: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
}): Promise<void>;
