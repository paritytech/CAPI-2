export type PlainDescriptor = {
  checksum: string
  payload: string
}

export interface PalletData {
  constants: Record<string, PlainDescriptor>
  errors: Record<string, PlainDescriptor>
  events: Record<string, PlainDescriptor>
  storage: Record<
    string,
    PlainDescriptor & { key: string; isOptional: boolean; docs: string[] }
  >
  tx: Record<string, PlainDescriptor>
}

export type ApiData = {
  docs: string[]
  methods: Record<
    string,
    {
      checksum: string | null
      payload: string
      args: string
      docs: string[]
    }
  >
}
