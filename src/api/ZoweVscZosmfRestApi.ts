/*
* This program and the accompanying materials are made available under the terms of the *
* Eclipse Public License v2.0 which accompanies this distribution, and is available at *
* https://www.eclipse.org/legal/epl-v20.html                                      *
*                                                                                 *
* SPDX-License-Identifier: EPL-2.0                                                *
*                                                                                 *
* Copyright Contributors to the Zowe Project.                                     *
*                                                                                 *
*/

import * as zowe from "@brightside/core";
import * as imperative from "@brightside/imperative";

import { ZoweVscApi } from "./IZoweVscRestApis";

export class ZoweVscZosmfUssRestApi implements ZoweVscApi.IUss {

    public getProfileTypeName(): string {
        return "zosmf";
    }

    public createSession(profile: imperative.IProfile): imperative.Session {
        return zowe.ZosmfSession.createBasicZosmfSession(profile);
    }

    public async fileList(session: imperative.Session, path: string): Promise<zowe.IZosFilesResponse> {
        return zowe.List.fileList(session, path);
    }

    public async isFileTagBinOrAscii(session: imperative.Session, USSFileName: string): Promise<boolean> {
        return zowe.Utilities.isFileTagBinOrAscii(session, USSFileName);
    }

    public async getContents(session: imperative.Session, ussFileName: string, options: zowe.IDownloadOptions
    ): Promise<zowe.IZosFilesResponse> {
        return zowe.Download.ussFile(session, ussFileName, options);
    }

    public async putContents(session: imperative.Session, inputFile: string, ussname: string,
                             binary?: boolean, localEncoding?: string,
                             etag?: string, returnEtag?: boolean): Promise<zowe.IZosFilesResponse> {
        return zowe.Upload.fileToUSSFile(session, inputFile, ussname, binary, localEncoding, etag, returnEtag);
    }
    public async create(session: imperative.Session, ussPath: string, type: string, mode?: string): Promise<string> {
        return zowe.Create.uss(session, ussPath, type);
    }

    public async delete(session: imperative.Session, fileName: string, recursive?: boolean): Promise<zowe.IZosFilesResponse> {
        return zowe.Delete.ussFile(session, fileName, recursive);
    }

    public async rename(session: imperative.Session, oldFilePath: string, newFilePath: string): Promise<zowe.IZosFilesResponse> {
        const result = await zowe.Utilities.renameUSSFile(session, oldFilePath, newFilePath);
        return {
            success: true,
            commandResponse: null,
            apiResponse: result
        };
    }
}