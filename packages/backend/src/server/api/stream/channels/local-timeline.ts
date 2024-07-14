import { Injectable } from '@nestjs/common';
import { checkWordMute } from '@/misc/check-word-mute.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { Packed } from '@/misc/schema.js';
import { MetaService } from '@/core/MetaService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import Channel from '../channel.js';

class LocalTimelineChannel extends Channel {
	public readonly chName = 'localTimeline';
	public static shouldShare = true;
	public static requireCredential = false;

	constructor(
		private metaService: MetaService,
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: any) {
		const policies = await this.roleService.getUserPolicies(this.user ? this.user.id : null);
		if (!policies.ltlAvailable) return;

		// Subscribe events
		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (note.user.host !== null) return;
		if (note.visibility !== 'public') return;
		if (note.channelId != null && !this.followingChannels.has(note.channelId)) return;

		// リプライなら元ノート参照、ミュート判定
		if (note.replyId != null) {
			note.reply = await this.noteEntityService.pack(note.replyId, this.user, {
				detail: true,
			});
			if (this.userProfile && await checkWordMute(note.reply, this.user, this.userProfile.mutedWords)) return;
		}
		// Renoteなら元ノート参照、ミュート判定
		if (note.renoteId != null) {
			note.renote = await this.noteEntityService.pack(note.renoteId, this.user, {
				detail: true,
			});
			if (this.userProfile && await checkWordMute(note.renote, this.user, this.userProfile.mutedWords)) return;
		}

		// 関係ない返信は除外
		if (note.reply && !this.user!.showTimelineReplies) {
			const reply = note.reply;
			// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
			if (reply.userId !== this.user!.id && note.userId !== this.user!.id && reply.userId !== note.userId) return;
		}

		// ワードミュート判定
		if (this.userProfile && await checkWordMute(note, this.user, this.userProfile.mutedWords)) return;

		// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.muting)) return;
		// 流れてきたNoteがブロックされているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.blocking)) return;

		this.connection.cacheNote(note);

		this.send('note', note);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off('notesStream', this.onNote);
	}
}

@Injectable()
export class LocalTimelineChannelService {
	public readonly shouldShare = LocalTimelineChannel.shouldShare;
	public readonly requireCredential = LocalTimelineChannel.requireCredential;

	constructor(
		private metaService: MetaService,
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): LocalTimelineChannel {
		return new LocalTimelineChannel(
			this.metaService,
			this.roleService,
			this.noteEntityService,
			id,
			connection,
		);
	}
}
