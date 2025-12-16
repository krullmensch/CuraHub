declare module 'exif-parser' {
    export interface ExifParser {
        parse(): {
            tags: {
                XResolution?: number;
                YResolution?: number;
                ResolutionUnit?: number;
                [key: string]: any;
            };
            imageSize: {
                width: number;
                height: number;
            };
        };
    }
    
    export function create(buffer: Buffer): ExifParser;
}
