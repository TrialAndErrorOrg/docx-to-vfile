import { Data, VFile } from 'vfile'
import { unzip } from 'unzipit'

const removeHeader = (text: string | undefined) => (text ? text.replace(/<\?xml.*?\?>/, '') : '')

const removeCarriage = (text: string | undefined) => (text ? text.replace(/\r/g, '') : '')

export interface Options {
  /**
   * Whether or not to include media in the VFile.
   *
   * By default, images are included on the `data.media` attribute of the VFile as an object of Blobs, which are accessible both client and serverside.
   *
   * @default false
   */
  withoutMedia?: boolean
  /**
   * Include only the specified files on the `data` attribute of the VFile.
   * This may be useful if you want to only do something with a subset of the files in the docx file, and don't intend to use 'reoff-stringify' to turn the VFile back into a docx file.
   *
   * - If an array of strings or regexps is passed, only files that match one of the values will be included.
   * - If a function is passed, it will be called for each file and should return true to include the file.
   * - If the value is 'all', almost all files will be included, except for 'word/document.xml', as that already is the root of the VFile.
   * - If the value is 'allWithDocumentXML', all files will be included, including `word/document.xml`, even though that is already the root of the VFile. Useful if you really want to mimic the original docx file.
   *
   * You should keep it at the default value if you intend to use 'reoff-stringify' to turn the VFile back into a docx file.
   *
   * @default 'all'
   */
  include?: string[] | RegExp[] | ((key: string) => boolean) | 'all' | 'allWithDocumentXML'
}

export interface OptionsWithFetchConfig extends Options {
  /**
   * The config to pass to fetch, for e.g. authorization headers.
   */
  fetchConfig?: RequestInit
}

/**
 * The data attribute of a VFile
 * Is set to the DataMap interface in the vfile module
 **/
export interface DocxData extends Data {
  /**
   * The textcontent of .xml files in the .docx file
   */
  [key: XMLOrRelsString]: string | undefined
  /**
   * The media files in the .docx file
   */
  media: { [key: string]: Blob }
  /**
   * The relations between the .xml files in the .docx file
   */
  relations: { [key: string]: string }
}

declare module 'vfile' {
  interface DataMap {
    /**
     * The textcontent of .xml files in the .docx file
     */
    [key: XMLOrRelsString]: string | undefined
    /**
     * The media files in the .docx file
     * Possibly undefined only to be compatible with the VFile interface
     */
    media: { [key: string]: Blob }
    /**
     * The relations between the .xml files in the .docx file
     * Possibly undefined only to be compatible with the VFile interface
     */
    relations: { [key: string]: string }
  }
}

export type XMLOrRelsString = `${string}.xml` | `${string}.rels`

/**
 * Extends VFile with a custom data attribute
 *
 * This information should be on the VFile interface, this is just used in contexts where you only want to know the type of the data attribute,
 * e.g. when writing a library that does something with the output of `docxToVFile`.
 */
export interface DocxVFile extends VFile {
  data: DocxData
}

/**
 * Takes a docx file as a Blob or File and returns a VFile with the contents of the document.xml file as the root, and the contents of the other xml files as data.
 *
 * @param file The docx file as a Blob or File
 * @param options Options
 * @returns A VFile with the contents of the document.xml file as the root, and the contents of the other xml files as data.
 */
export async function docxToVFile(
  file: ArrayBuffer | File | Blob | Buffer | string,
  userOptions?: Options,
): Promise<VFile> {
  let input = file

  // node code
  if (typeof window === 'undefined') {
    const { readFile } = await import('fs/promises')
    const inp = typeof file === 'string' ? await readFile(file) : file

    input = Buffer.isBuffer(inp) ? new Blob([inp]) : file
  }

  const options: Options = {
    withoutMedia: false,
    include: 'all',
    ...userOptions,
  }

  const { entries } = await unzip(input)
  const rels = await entries['word/_rels/document.xml.rels'].text()
  const relations = Object.fromEntries(
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    [...rels.matchAll(/Id="(.*?)".*?Target="(.*?)"/g)].map((match) => [match[1], match[2]]),
  )

  const doc = await entries['word/document.xml'].text()

  const textEntriesObjectEntries = await Promise.all(
    Object.entries(entries)
      .filter(([key]) => /xml|rels/.test(key))
      .filter(([key]) => {
        if (options.include === 'all') {
          return key !== 'word/document.xml'
        }
        if (options.include === 'allWithDocumentXML') {
          return true
        }
        if (typeof options.include === 'function') {
          return options.include(key)
        }
        if (Array.isArray(options.include)) {
          return options.include.some((include) => {
            if (typeof include === 'string') {
              return key.includes(include)
            }
            if (include instanceof RegExp) {
              return include.test(key)
            }
            return false
          })
        }
        return false
      })
      .map(async ([key, value]) => [key, removeCarriage(await value.text())]),
  )

  const textEntriesObject = Object.fromEntries(textEntriesObjectEntries)

  // const vfile = new VFile(removeCarriage(doc))

  const vfileData: DocxData = textEntriesObject
  vfileData.relations = relations
  vfileData.media = {} as { [key: string]: Blob }

  // vfile.data = vfileData

  if (options.withoutMedia) {
    return new VFile({ value: removeCarriage(doc), data: vfileData })
  }

  const mediaUrls = Object.values(relations).filter((rel: string) => rel.includes('media/'))
  const media = {} as { [key: string]: Blob }
  for (const url of mediaUrls) {
    media[url] = await entries[`word/${url}`].blob()
  }
  vfileData.media = media
  return new VFile({ value: removeCarriage(doc), data: vfileData })
}
