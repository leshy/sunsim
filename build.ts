import * as esbuild from "npm:esbuild"
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader"

await esbuild.build({
    plugins: [...denoPlugins()],
    entryPoints: ["clientside.ts"],
    outfile: "./static/js/bundle.js",
    bundle: true,
    format: "esm",
    conditions: ["browser"],
})

esbuild.stop()
