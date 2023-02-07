import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { MyVika, VikaPluginSettings } from "utils/vika";
import { MyNote, MyObsidian } from "utils/obsidian";


const DEFAULT_SETTINGS: VikaPluginSettings = {
	"token": "",
	"datasheetList": []
}

export default class VikaSyncPlugin extends Plugin {
	settings: VikaPluginSettings;
	vika: MyVika;
	ob: MyObsidian;
	async onload() {
		try{
			await this.loadSettings();
		}
		catch (e) {
			console.log(e);
		}
		this.addCommand({
			id: 'vika-sync-create-record',
			name: 'Create: this Note',
			callback: () => {
				this.ob.createRecordInThisPage()
			}});
		this.addCommand({
			id: 'vika-sync-update-note',
			name: 'Update: this Note',
			callback: () => {
				this.ob.updateRecordInThisPage()
			}});
		this.addCommand({
			id: 'vika-sync-update-note-in-folder',
			name: 'Update: this Folder',
			callback: () => {
				this.ob.updateRecordInThisFolder()
			}});
		this.addCommand({
			id: 'vika-sync-update-note-in-vault',
			name: 'Update: this Vault',
			callback: () => {
				this.ob.updateAllRecord();
		}});
		this.addCommand({
			id: 'vika-sync-delete-note-record',
			name: 'Delete: this Note & Record',
			callback: () => {
				this.ob.deleteRecordAndThisPage()
		}
		});
		this.addCommand({
			id: 'vika-sync-recover-note',
			name: 'Download: this Note',
			callback: () => {
				this.ob.recoverFromRecord()
			}});
		this.addCommand({
			id: 'vika-sync-recover-note-in-folder',
			name: 'Download: this Folder',
			callback: () => {
				this.ob.getRecordInThisFolder()
			}});
		this.addSettingTab(new SettingTab(this.app, this));
	}


	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.vika = new MyVika(this.settings);
		this.ob = new MyObsidian(this.app, this.vika, this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		try{
			await this.loadSettings();
		}
		catch (e) {
			console.log(e);
		}
	}
}

class SettingTab extends PluginSettingTab {
	plugin: VikaSyncPlugin;
	settingsEl: Setting[];

	constructor(app: App, plugin: VikaSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.settingsEl = [];
	}

	reloadSetting(datasheet: any[], containerEl: HTMLElement) {
		this.settingsEl.forEach((setting) => {
			setting.settingEl.remove();
		});

		for(let index =0; index < datasheet.length; index++){
			this.settingsEl.push(new Setting(containerEl)
					.setName(this.plugin.settings.datasheetList[index].name)
					.addTextArea(text => text
						.setPlaceholder("")
						.setValue(JSON.stringify(this.plugin.settings.datasheetList[index].updateField))
						.onChange(async (value) => {
							try {								
								const json = JSON.parse(value);
								this.plugin.settings.datasheetList[index].updateField = json;
								text.inputEl.style.border = "1px solid green";
								await this.plugin.saveSettings();
							} catch (e) {
								text.inputEl.style.border = "1px solid red";
							}
						}
					)
				)
				.addTextArea(text => text
					.setPlaceholder("")
					.setValue(JSON.stringify(this.plugin.settings.datasheetList[index].recoverField))
					.onChange(async (value) => {
						try{								
							this.plugin.settings.datasheetList[index].recoverField = JSON.parse(value);
							text.inputEl.style.border = "1px solid green";
							await this.plugin.saveSettings();
						} catch (e) {
							text.inputEl.style.border = "1px solid red";
						}
					}
				)	
			))
		}
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h1', {text: 'Vika Sync Settings'});
		
		new Setting(containerEl)
			.setName('Token')
			.setDesc("从Vika的API设置中获取")
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.token)
				.onChange(async (value) => {
					this.plugin.settings.token = value;
					await this.plugin.saveSettings();
				}))
			.addButton(async (cb) => {
				cb.setButtonText("Refresh")
				cb.onClick(async () => {
					try {							
						new Notice("Start Refresh");
						await this.plugin.vika.getAllDatasheetInfo();
						this.plugin.settings.datasheetList = this.plugin.vika.datasheetList;
						this.reloadSetting(this.plugin.settings.datasheetList, containerEl);
						new Notice("Refresh Success");
					} catch (e) {
						new Notice(`Refresh Failed: ${e}`);
					}
				})
			}
		);
		containerEl.createEl('h1', {text: 'Datasheet List'});
		this.reloadSetting(this.plugin.settings.datasheetList, containerEl);
	}
}
