import { App, Editor, MarkdownView, Modal, Notice, MetadataCache, TFile, 
    parseFrontMatterStringArray, getAllTags, FrontMatterCache, CachedMetadata, 
    parseFrontMatterAliases, parseFrontMatterEntry } from 'obsidian';
import { resolve, extname, relative, join, parse, posix } from "path";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync, exec } from "child_process";
import { MyVika } from "utils/vika";
import { ICreateRecordsResponseData, IHttpErrorResponse, IHttpResponse } from '@vikadata/vika';

export {MyNote, MyObsidian};

// 这些值都可以从 Obsidian 的 API 中获取
interface BasicFields {
    "标题": string;
    "文件夹": string;
    "标签": Array<string>;
    "别名": Array<string>;
    "内容": string;
    "出链": Array<string>;
    "入链": Array<string>;
    "URL": string;
}

interface BasicFrontMatterAtrributes {
    uid: string | undefined;
    vikaLink: string | undefined;
    tags: Array<string>|null;
    aliases: Array<string>|null;
}

class MyObsidian {
    app: App;
    vault: any;
    vika: MyVika;
    constructor(app: App, vika: MyVika) {
        this.app = app;
        this.vault = app.vault;
        this.vika = vika;
    }

    async createRecordInThisPage() {
        let file: TFile|null = this.app.workspace.getActiveFile();
        if (!file) {
            return null;
        }
        let note: MyNote = new MyNote(this.app, file, this.vika);
        let res = await note.createRecord();
        return res;
    }

    async updateRecordInThisPage() {
        let file: TFile|null = this.app.workspace.getActiveFile();
        if (!file) {
            return null;
        }
        let note: MyNote = new MyNote(this.app, file, this.vika);
        let res = await note.updateRecord();
        return res;
    }

    async deleteRecordInThisPage() {
    }

    async createRecordInThisFolder() {
    }

    async updateRecordInThisFolder() {
    }

    async updateALL() {
    }
}

class MyNote {
    app: App;
    file: any;
    vika: MyVika;
    cache: CachedMetadata|null;
    frontmatter: FrontMatterCache|undefined;
    title: string;
    folder: string;
    tags: Array<string>|null;
    aliases: Array<string>|null;
    content: string;
    outlink: Array<string>;
    backlink: Array<string>;
    obsidianURL: string;
    uid: string | undefined;
    vikaLink: string | undefined;

    constructor(app: App, file: TFile, vika: MyVika) {
        this.app = app;
        this.file = file;
        this.vika = vika;
    }

    async updateInfo(){
        let file:TFile = this.file;
        this.frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
        this.cache = app.metadataCache.getFileCache(file);
        this.aliases = parseFrontMatterAliases(this.frontmatter) || [];
        this.tags = this.cache? (getAllTags(this.cache) || []):[];
        this.title = file.basename;
        this.folder = file.parent.name;
        const vaultName = encodeURI(file.vault.getName());
        let basicURL:string = `obsidian://open?vault=${vaultName}&file=${file.path}`; 
        let advancedURL:string = `obsidian://advanced-uri?vault=${vaultName}&uid=`;
        this.uid = this.frontmatter?.["uid"];
        this.obsidianURL = this.uid? advancedURL + this.uid: basicURL;
        this.vikaLink = this.frontmatter?.["vikaLink"];
        this.content = await this.app.vault.read(this.file);
        this.content = this.removeFrontMatterFromContent(this.content);
        let data: BasicFields = {
                "标题": this.title,
                "文件夹": this.folder,
                "标签": this.tags,
                "别名": this.aliases,
                "内容": this.content,
                "出链": [],
                "入链": [],
                "URL": this.obsidianURL,
            }
        return data;
    }

    async createRecord() {
        const msg = await this.updateInfo();
        const record = await this.vika.createRecord(msg)
        if(!record.success)
            console.log(msg);
        this.updateFrontMatterFromRecord(record);
        return record;
    }

    async updateRecord() {
        const msg = await this.updateInfo();
       
        if(this.uid){
            const record = await this.vika.updateRecord(this.uid, msg)
            if(!record.success)
                console.log(msg);
            this.updateFrontMatterFromRecord(record);
            return record;
        }
        else{
            return await this.createRecord();
        }
    }

    parseFrontMatterDict(fm: FrontMatterCache|undefined){
        let fm_dict:{[key:string]:any} = {}
        if (!fm)
            return fm_dict;
        for(let [key, value] of Object.entries(fm).filter(([key, value]) => key !== "position"))
        {
            if (value instanceof Array) {
                let arrayData = parseFrontMatterStringArray(fm, key) || value;
                fm_dict[key] = arrayData;
            } else {
                fm_dict[key] = parseFrontMatterEntry(fm, key) || value;
            }
        }
        return fm_dict;
    }

    updateFrontMatterFromRecord(record: IHttpResponse<ICreateRecordsResponseData> | undefined){
        if(!record?.success)
            return null;
        let fm_dict = this.parseFrontMatterDict(this.frontmatter);
        fm_dict["uid"] = record.data?.records[0]?.recordId;
        fm_dict["vikaLink"] = this.vika.getURL(fm_dict["uid"]);
        fm_dict["tags"] = record.data?.records[0]?.fields["标签"] || [""];
        fm_dict["aliases"] = record.data?.records[0]?.fields["别名"] || [""];
        
        let fm_text = this.dumpsFrontMatter(fm_dict);
        let full_content = fm_text + '\n' + this.content;
        this.app.vault.modify(this.file, full_content);

        this.updateInfo();
        return null;
    }

    // 必须在FrontMatter获取后调用
    removeFrontMatterFromContent(content: string){
        let docArray = content.split("\n");
		let startLine = this.frontmatter ? this.frontmatter.position.end.line + 1 : 0;
        return docArray.slice(startLine).join("\n");
    }

    dumpsFrontMatter(fm_dict: {[key:string]:any}){
        let fm_text = Object.entries(fm_dict).map(([key, value]) => key + ": " + this.makeFmValue(value)).join("\n")
        fm_text = fm_text?"---\n" + fm_text + "\n---\n":"";
        return fm_text;
    }

	makeFmValue(value:any) {
		if (value instanceof Array) {
			return "\n" + value.map(item => " - " + item).join("\r");
		} else {
			return value;
		}
	}
}