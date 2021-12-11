import $ from 'cafy';
import define from '../define';
import { createExportCustomEmojisJob } from '@/queue/index';
import ms from 'ms';

export const meta = {
	secure: true,
	requireCredential: true as const,
	limit: {
		duration: ms('1hour'),
		max: 1,
	},
};

export default define(meta, async (ps, user) => {
	createExportCustomEmojisJob(user);
});