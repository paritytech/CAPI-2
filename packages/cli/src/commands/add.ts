import { getMetadata, writeMetadataToDisk } from "@/metadata"
import { EntryConfig, readPapiConfig, writePapiConfig } from "@/papiConfig"
import { WellKnownChain } from "@substrate/connect"
import ora from "ora"

export interface AddOptions {
  file?: string
  wsUrl?: string
  chainSpec?: string
  name?: WellKnownChain
  persist?: string
}

export async function add(
  key: string,
  outputFolder = "str/codegen",
  options: AddOptions,
) {
  const entries = (await readPapiConfig()) ?? {}
  if (key in entries) {
    console.warn(`Replacing existing ${key} config`)
  }

  if (options.file) {
    entries[key] = {
      metadata: options.file,
      outputFolder,
    }
  } else {
    const entry = entryFromOptions(outputFolder, options)
    entries[key] = entry

    if (options.persist) {
      const spinner = ora(`Loading metadata`).start()
      const metadata = await getMetadata(entry)

      spinner.text = "Writing metadata"
      const filename = options.persist + ".scale"
      await writeMetadataToDisk(metadata!, filename)

      spinner.succeed(`Metadata saved as ${filename}`)
      entry.metadata = filename
    }
  }

  await writePapiConfig(entries)
  return console.log(`Saved new spec ${key} from file ${options.file}`)
}

const entryFromOptions = (
  outputFolder: string,
  options: AddOptions,
): EntryConfig => {
  if (options.wsUrl) {
    return {
      outputFolder,
      wsUrl: options.wsUrl,
    }
  }
  if (options.chainSpec) {
    return {
      outputFolder,
      chainSpec: options.chainSpec,
    }
  }
  if (options.name) {
    return {
      outputFolder,
      chain: options.name as WellKnownChain,
    }
  }

  throw new Error(
    "add command needs one source, specified by options -f -w -c or -n",
  )
}
