import { PalletData } from "./types"
import fs from "fs/promises"
import fsExists from "fs.promises.exists"
import tsc from "tsc-prog"
import path from "path"
import { mapObject } from "@polkadot-api/utils"

const customStringifyObject = (
  input: string | Record<string, any> | Array<any>,
): string => {
  if (typeof input === "string") return input

  if (Array.isArray(input))
    return `[${input.map(customStringifyObject).join(", ")}]`

  return `{${Object.entries(mapObject(input, customStringifyObject))
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")}}`
}

export const createDescriptorsFile = async (
  key: string,
  outputFolder: string,
  descriptors: {
    pallets: Record<string, PalletData>
    apis: Record<
      string,
      Record<
        string,
        {
          checksum: string | null
          payload: string
          args: string
        }
      >
    >
  },
  enums: Array<string>,
) => {
  const { pallets, apis } = descriptors

  const knownImports: Array<string> = [
    `import type { GetEnum, RuntimeDescriptor, PlainDescriptor, TxDescriptor, StorageDescriptor, QueryFromDescriptors,TxFromDescriptors,EventsFromDescriptors,ErrorsFromDescriptors,ConstFromDescriptors } from "@polkadot-api/client"\n`,
    `import { _Enum } from "@polkadot-api/client"\n`,
  ]
  const keyTypesImports: Array<string> = []
  const addTypeImport = (type: string) => {
    keyTypesImports.push(type)
  }

  const code: Array<string> = []
  const addLine = (line: string) => {
    code.push(line)
  }

  type Descriptors = Record<
    string,
    Record<
      string,
      {
        varName: string
        types: string
      }
    >
  >
  const stgDescriptors: Descriptors = {}
  const txDescriptors: Descriptors = {}
  const evDescriptors: Descriptors = {}
  const errDescriptors: Descriptors = {}
  const constDescriptors: Descriptors = {}
  const runtimeDescriptors: Descriptors = {}

  for (const [
    pallet,
    { errors, events, constants, storage, tx },
  ] of Object.entries(pallets)) {
    errDescriptors[pallet] = {}
    for (const [errorName, { checksum, payload }] of Object.entries(errors)) {
      const types = `PlainDescriptor<${payload}>`
      const varName = `Err${pallet}${errorName}`
      errDescriptors[pallet][errorName] = { types, varName }
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types};`)
    }

    evDescriptors[pallet] = {}
    for (const [evName, { checksum, payload }] of Object.entries(events)) {
      const types = `PlainDescriptor<${payload}>`
      const varName = `Ev${pallet}${evName}`
      evDescriptors[pallet][evName] = { types, varName }
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types}`)
    }

    constDescriptors[pallet] = {}
    for (const [constName, { checksum, payload }] of Object.entries(
      constants,
    )) {
      const types = `PlainDescriptor<${payload}>`
      const varName = `Const${pallet}${constName}`
      constDescriptors[pallet][constName] = { types, varName }
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types}`)
    }

    txDescriptors[pallet] = {}
    for (const [txName, { checksum, payload }] of Object.entries(tx)) {
      const types = `TxDescriptor<${payload}>`
      const varName = `Tx${pallet}${txName}`
      txDescriptors[pallet][txName] = { types, varName }
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types}`)
    }

    stgDescriptors[pallet] = {}
    for (const [
      stgName,
      { checksum, payload, key, isOptional },
    ] of Object.entries(storage)) {
      const types = `StorageDescriptor<${key}, ${payload}, ${isOptional}>`
      const varName = `Stg${pallet}${stgName}`
      stgDescriptors[pallet][stgName] = { types, varName }
      addTypeImport(key)
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types}`)
    }
  }

  for (const [namespace, methods] of Object.entries(apis)) {
    runtimeDescriptors[namespace] = {}

    for (const [method, { checksum, payload, args }] of Object.entries(
      methods,
    )) {
      const types = `RuntimeDescriptor<${args}, ${payload}>`
      const varName = `RuntimeApi${namespace}${method}`
      runtimeDescriptors[namespace][method] = { types, varName }
      addTypeImport(args)
      addTypeImport(payload)
      addLine(`const ${varName}: ${types} = "${checksum}" as ${types}`)
    }
  }

  addLine("")
  addLine("")

  addLine(
    `type I${key}DescriptorsPallets = ${customStringifyObject(
      mapObject(pallets, (_, key) =>
        [
          stgDescriptors,
          txDescriptors,
          evDescriptors,
          errDescriptors,
          constDescriptors,
        ].map((x) => mapObject(x[key], (v) => v.types)),
      ),
    )};\n`,
  )

  addLine(
    `type I${key}DescriptorsApis = ${customStringifyObject(
      mapObject(runtimeDescriptors, (out) => mapObject(out, (x) => x.types)),
    )};\n`,
  )

  addLine(
    `type I${key}Descriptors = { pallets: I${key}DescriptorsPallets, apis: I${key}DescriptorsApis };\n`,
  )

  addLine(
    `const _allPalletDescriptors: I${key}DescriptorsPallets = ${customStringifyObject(
      mapObject(pallets, (_, key) =>
        [
          stgDescriptors,
          txDescriptors,
          evDescriptors,
          errDescriptors,
          constDescriptors,
        ].map((x) => mapObject(x[key], (v) => v.varName)),
      ),
    )};\n`,
  )

  addLine(
    `const _allApiDescriptors: I${key}DescriptorsApis = ${customStringifyObject(
      mapObject(runtimeDescriptors, (api) =>
        mapObject(api, (method) => method.varName),
      ),
    )};\n`,
  )

  addLine(
    `const _allDescriptors: I${key}Descriptors = { pallets: _allPalletDescriptors, apis: _allApiDescriptors }`,
  )

  addLine(`export default _allDescriptors`)
  addLine(`export type Queries = QueryFromDescriptors<I${key}Descriptors>`)
  addLine(`export type Calls = TxFromDescriptors<I${key}Descriptors>`)
  addLine(`export type Events = EventsFromDescriptors<I${key}Descriptors>`)
  addLine(`export type Errors = ErrorsFromDescriptors<I${key}Descriptors>`)
  addLine(`export type Constants = ConstFromDescriptors<I${key}Descriptors>`)
  addLine(``)

  enums.forEach((x) => {
    addLine(`export type ${x} = _E${x};`)
    addLine(`export const ${x} = _Enum as unknown as GetEnum<${x}>;`)
  })

  const descriptorCodegen =
    knownImports
      .concat(
        `import type {${keyTypesImports.join(", ")}} from "./${key}-types"
import type {${enums
          .map((n) => `${n} as _E${n}`)
          .join(",")}} from "./${key}-types"
`,
      )
      .join(";\n") +
    "\n\n" +
    code.join("\n")

  await fs.writeFile(`${outputFolder}/${key}.ts`, descriptorCodegen)

  // Run tsc again to make sure the final .ts file has no compile errors
  {
    const tscFileName = path.join(outputFolder, key)
    if (await fsExists(`${tscFileName}.d.ts`)) {
      await fs.rm(`${tscFileName}.d.ts`)
    }

    tsc.build({
      basePath: outputFolder,
      compilerOptions: {
        skipLibCheck: true,
        emitDeclarationOnly: true,
        declaration: true,
        target: "esnext",
        module: "esnext",
        moduleResolution: "node",
      },
      include: [`${key}.ts`],
    })
  }
}
