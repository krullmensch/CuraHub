declare module 'exif-parser' {
    export interface ExifParser {
        parse(): {
            tags: {
                XResolution?: number;
                YResolution?: number;
                ResolutionUnit?: number;
                [key: string]: unknown;
            };
            imageSize: {
                width: number;
                height: number;
            };
        };
    }
    
    export function create(buffer: Buffer): ExifParser;
}
