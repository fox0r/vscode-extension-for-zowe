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
import { IProfileLoaded, Logger } from "@brightside/imperative";
import * as utils from "./utils";
import * as vscode from "vscode";
import { ZoweUSSNode } from "./ZoweUSSNode";
import { loadNamedProfile, loadDefaultProfile } from "./ProfileLoader";
import { PersistentFilters } from "./PersistentFilters";
import * as nls from "vscode-nls";
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

/**
 * Creates the USS tree that contains nodes of sessions and data sets
 *
 * @export
 */
export async function createUSSTree(log: Logger) {
    const tree = new USSTree();
    await tree.addSession(log);
    await tree.initialize(log);
    return tree;
}

/**
 * A tree that contains nodes of sessions and USS Files
 *
 * @export
 * @class USSTree
 * @implements {vscode.TreeDataProvider}
 */
export class USSTree implements vscode.TreeDataProvider<ZoweUSSNode> {

    private static readonly persistenceSchema: string = "Zowe-USS-Persistent-Favorites";
    private static readonly favorites: string = "favorites";
    private static readonly defaultDialogText: string = localize("SpecifyFilter", " -- Specify Filter -- ");

    public mSessionNodes: ZoweUSSNode[];
    public mFavoriteSession: ZoweUSSNode;
    public mFavorites: ZoweUSSNode[] = [];

    // Event Emitters used to notify subscribers that the refresh event has fired
    public mOnDidChangeTreeData: vscode.EventEmitter<ZoweUSSNode | undefined> = new vscode.EventEmitter<ZoweUSSNode | undefined>();
    public readonly onDidChangeTreeData: vscode.Event<ZoweUSSNode | undefined> = this.mOnDidChangeTreeData.event;

    private mHistory: PersistentFilters;
    private log: Logger;

    constructor() {
        this.mSessionNodes = [];
        this.mFavoriteSession = new ZoweUSSNode(localize("Favorites", "Favorites"),
            vscode.TreeItemCollapsibleState.Collapsed, null, null, null);
        this.mFavoriteSession.contextValue = "favorite";
        this.mSessionNodes = [this.mFavoriteSession];
        this.mFavoriteSession.iconPath = utils.applyIcons(this.mFavoriteSession);
        this.mHistory = new PersistentFilters(USSTree.persistenceSchema);
    }

    /**
     * Takes argument of type ZoweUSSNode and returns it converted to a general [TreeItem]
     *
     * @param {ZoweUSSNode} element
     * @returns {vscode.TreeItem}
     */
    public getTreeItem(element: ZoweUSSNode): vscode.TreeItem {
        return element;
    }

    /**
     * Takes argument of type ZoweUSSNode and retrieves all of the first level children
     *
     * @param {ZoweUSSNode} [element] - Optional parameter; if not passed, returns root session nodes
     * @returns {ZoweUSSNode[] | Promise<ZoweUSSNode[]>}
     */
    public getChildren(element?: ZoweUSSNode): ZoweUSSNode[] | Promise<ZoweUSSNode[]> {
        if (element) {
            if (element.contextValue === "favorite") {
                return this.mFavorites;
            }
            return element.getChildren();
        }
        return this.mSessionNodes;
    }

    /**
     * Called whenever the tree needs to be refreshed, and fires the data change event
     *
     */
    public refresh(): void {
        this.mOnDidChangeTreeData.fire();
    }

    /**
     * Called whenever the tree needs to be refreshed, and fires the data change event
     *
     */
    public refreshElement(element: ZoweUSSNode): void {
        element.dirty = true;
        this.mOnDidChangeTreeData.fire(element);
    }

    /**
     * Returns the parent node or null if it has no parent
     *
     * @param {ZoweUSSNode} element
     * @returns {vscode.ProviderResult<ZoweUSSNode>}
     */
    public getParent(element: ZoweUSSNode): vscode.ProviderResult<ZoweUSSNode> {
        return element.mParent;
    }

    /**
     * Adds a new session to the uss files tree
     *
     * @param {string} [sessionName] - optional; loads default profile if not passed
     */
    public async addSession(log: Logger, sessionName?: string) {
        // Loads profile associated with passed sessionName, default if none passed
        const zosmfProfile: IProfileLoaded = sessionName ? loadNamedProfile(sessionName) : loadDefaultProfile(log);
        if (zosmfProfile) {
            // If session is already added, do nothing
            if (this.mSessionNodes.find((tempNode) => tempNode.label.trim() === zosmfProfile.name)) {
                return;
            }

            // Uses loaded profile to create a zosmf session with brightside
            const session = zowe.ZosmfSession.createBasicZosmfSession(zosmfProfile.profile);

            // Creates ZoweUSSNode to track new session and pushes it to mSessionNodes
            const node = new ZoweUSSNode(zosmfProfile.name, vscode.TreeItemCollapsibleState.Collapsed, null, session, "", false,
                            zosmfProfile.name);
            node.contextValue = "uss_session";
            node.iconPath = utils.applyIcons(node);
            this.mSessionNodes.push(node);
            node.dirty = true;
            this.refresh();
        }
    }

    /**
     * Removes a session from the list in the uss files tree
     *
     * @param {ZoweUSSNode} [node]
     */
    public deleteSession(node: ZoweUSSNode) {
        // Removes deleted session from mSessionNodes
        this.mSessionNodes = this.mSessionNodes.filter((tempNode) => tempNode.label !== node.label);
        this.refresh();
    }

    /**
     * Adds a node to the USS favorites list
     *
     * @param {ZoweUSSNode} node
     */
    public async addUSSFavorite(node: ZoweUSSNode) {
        let temp: ZoweUSSNode;
        temp = new ZoweUSSNode(node.fullPath,
            node.collapsibleState,
            this.mFavoriteSession,
            node.getSession(),
            node.mParent.fullPath,
            false,
            node.getSessionNode().mProfileName);
        temp.contextValue += "f";
        if (temp.contextValue === "textFilef" || temp.contextValue === "binaryFilef") {
            temp.command = { command: "zowe.uss.ZoweUSSNode.open", title: "Open", arguments: [temp] };
        }
        temp.iconPath = utils.applyIcons(node);
        if (!this.mFavorites.find((tempNode) => tempNode.label === temp.label)) {
            this.mFavorites.push(temp); // testing
            await this.updateFavorites();
            this.refreshElement(this.mFavoriteSession);
        }
    }

    /**
     * Removes a node from the favorites list
     *
     * @param {ZoweUSSNode} node
     */
    public async removeUSSFavorite(node: ZoweUSSNode) {
        this.mFavorites = this.mFavorites.filter((temp) =>
            !((temp.fullPath === node.fullPath) && (temp.contextValue.startsWith(node.contextValue))));
        await this.updateFavorites();
        this.refreshElement(this.mFavoriteSession);
    }

    public async updateFavorites() {
        const settings: any = { ...vscode.workspace.getConfiguration().get(USSTree.persistenceSchema) };
        if (settings.persistence) {
            settings.favorites = this.mFavorites.map((fav) => fav.profileName + fav.fullPath + "{" + fav.contextValue.slice(0, -1) + "}");
            await vscode.workspace.getConfiguration().update(USSTree.persistenceSchema, settings, vscode.ConfigurationTarget.Global);
        }
    }

    /**
     * Change the state of an expandable node
     * @param provider the tree view provider
     * @param element the node being flipped
     * @param isOpen the intended state of the the tree view provider, true or false
     */
    public async flipState(element: ZoweUSSNode, isOpen: boolean = false) {
        element.iconPath = utils.applyIcons(element, isOpen ? "open" : "closed");
        element.dirty = true;
        this.mOnDidChangeTreeData.fire(element);
    }


    public async onDidChangeConfiguration(e) {
        if (e.affectsConfiguration(USSTree.persistenceSchema)) {
            const setting: any = { ...vscode.workspace.getConfiguration().get(USSTree.persistenceSchema) };
            if (!setting.persistence) {
                setting.favorites = [];
                setting.history = [];
                await vscode.workspace.getConfiguration().update(USSTree.persistenceSchema,
                    setting, vscode.ConfigurationTarget.Global);
            }
        }
    }

    public async addHistory(criteria: string) {
        this.mHistory.addHistory(criteria);
        this.refresh();
    }

    /**
     * Prompts the user for a path, and populates the [TreeView]{@link vscode.TreeView} based on the path
     *
     * @param {ZoweUSSNode} node - The session node
     * @param {ussTree} ussFileProvider - Current ussTree used to populate the TreeView
     * @returns {Promise<void>}
     */
    public async ussFilterPrompt(node: ZoweUSSNode) {
        if (this.log) {
            this.log.debug(localize("ussFilterPrompt.log.debug.promptUSSPath", "Prompting the user for a USS path"));
        }
        const sessionNode = node.getSessionNode();
        let remotepath: string = USSTree.defaultDialogText;

        const modItems = Array.from(this.mHistory.getHistory());
        if (modItems.length > 0) {
            // accessing history
            const options1: vscode.QuickPickOptions = {
                placeHolder: localize("searchHistory.options.prompt",
                "Choose \"-- Specify Filter --\" to define a new filter or select a previously defined one")
            };
            modItems.unshift(USSTree.defaultDialogText);
            // get user selection
            remotepath = await vscode.window.showQuickPick(modItems, options1);
            if (!remotepath) {
                vscode.window.showInformationMessage(localize("enterPattern.pattern", "No selection made."));
                return;
            }
        }
        if (remotepath === USSTree.defaultDialogText) {
            // manually entering a search
            const options: vscode.InputBoxOptions = {
                prompt: localize("ussFilterPrompt.option.prompt.search",
                    "Search Unix System Services (USS) by entering a path name starting with a /"),
                value: sessionNode.fullPath
            };
            // get user input
            remotepath = await vscode.window.showInputBox(options);
            if (!remotepath) {
                vscode.window.showInformationMessage(localize("ussFilterPrompt.enterPath", "You must enter a path."));
                return;
            }
        }

        // Sanitization: Replace multiple preceding forward slashes with just one forward slash
        const sanitizedPath = remotepath.replace(/\/\/+/, "/");
        sessionNode.tooltip = sessionNode.fullPath = sanitizedPath;
        sessionNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        sessionNode.iconPath = utils.applyIcons(sessionNode, "open");
        // update the treeview with the new path
        sessionNode.label = `${sessionNode.mProfileName} [${sanitizedPath}]`;
        sessionNode.dirty = true;
        this.addHistory(sanitizedPath);
    }

    public async initialize(log: Logger) {
        this.log = log;
        this.log.debug(localize("initializeFavorites.log.debug", "initializing favorites"));
        const lines: string[] = this.mHistory.readFavorites();
        lines.forEach(async (line) => {
            const profileName = line.substring(1, line.lastIndexOf("]"));
            const nodeName = (line.substring(line.indexOf(":") + 1, line.indexOf("{"))).trim();
            const session = await utils.getSession(profileName);
            let node: ZoweUSSNode;
            if (line.substring(line.indexOf("{") + 1, line.lastIndexOf("}")) === "directory") {
            node = new ZoweUSSNode(
                nodeName,
                vscode.TreeItemCollapsibleState.Collapsed,
                this.mFavoriteSession,
                session,
                "",
                false,
                profileName
            );
            } else {
                node = new ZoweUSSNode(
                    nodeName,
                    vscode.TreeItemCollapsibleState.None,
                    this.mFavoriteSession,
                    session,
                    "",
                    false,
                    profileName
                );
                node.command = {command: "zowe.uss.ZoweUSSNode.open",
                                title: localize("initializeUSSFavorites.lines.title", "Open"), arguments: [node]};
            }
            node.contextValue += "f";
            node.iconPath = utils.applyIcons(node);
            this.mFavorites.push(node);
        });
    }
}
