declare module 'draco3dgltf' {
    function createDecoderModule(): Promise<unknown>;
    function createEncoderModule(): Promise<unknown>;
    export default { createDecoderModule, createEncoderModule };
}
