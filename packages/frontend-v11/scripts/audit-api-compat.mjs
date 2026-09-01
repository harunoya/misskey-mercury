/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const clientRoot = resolve(packageRoot, 'vendor/misskey-11.37.1/src/client/app');
const endpointListPath = resolve(repositoryRoot, 'packages/backend/src/server/api/endpoint-list.ts');
const supportedExtensions = new Set(['.js', '.ts', '.vue']);
const specialApiRoutes = new Set(['signin', 'signup']);
const transportFiles = new Set([
	'src/compat/api.ts',
	'src/compat/upload.ts',
]);
const excludedUnbundledFiles = new Set([
	'vendor/misskey-11.37.1/src/client/app/boot.js',
	'vendor/misskey-11.37.1/src/client/app/sw.js',
]);
const reviewedDynamicFiles = new Set([
	// Generic paging receives literal current endpoint names from each component's pagination config.
	'vendor/misskey-11.37.1/src/client/app/common/scripts/paging.ts',
	// This is the user-operated API console; its endpoint is intentionally entered at runtime.
	'vendor/misskey-11.37.1/src/client/app/common/views/components/settings/api.vue',
]);
const streamConnectionPath = resolve(repositoryRoot, 'packages/backend/src/server/api/stream/Connection.ts');

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(async entry => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return walk(path);
		return supportedExtensions.has(extname(entry.name)) ? [path] : [];
	}));
	return nested.flat();
}

function lineNumber(source, offset) {
	return source.slice(0, offset).split('\n').length;
}

function normalizePath(path) {
	return relative(packageRoot, path).replaceAll('\\', '/');
}

function unwrapExpression(expression) {
	let current = expression;
	while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
		current = current.expression;
	}
	return current;
}

function propertyName(node) {
	if (node == null) return null;
	if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
	return null;
}

function objectProperty(object, name) {
	return object.properties.find(property => ts.isPropertyAssignment(property) && propertyName(property.name) === name);
}

function schemaObjectKeys(object) {
	const keys = new Set();
	let complete = true;
	for (const property of object.properties) {
		if (ts.isSpreadAssignment(property)) {
			complete = false;
			continue;
		}
		const name = propertyName(property.name);
		if (name == null) complete = false;
		else keys.add(name);
	}
	return { keys, complete };
}

function collectTopLevelSchemaProperties(object, variants) {
	let complete = true;
	const directProperties = objectProperty(object, 'properties');
	if (directProperties != null) variants.push(unwrapExpression(directProperties.initializer));

	for (const keyword of ['allOf', 'anyOf']) {
		const property = objectProperty(object, keyword);
		if (property == null) continue;
		const value = unwrapExpression(property.initializer);
		if (!ts.isArrayLiteralExpression(value)) {
			complete = false;
			continue;
		}
		for (const element of value.elements) {
			const child = unwrapExpression(element);
			if (!ts.isObjectLiteralExpression(child)) complete = false;
			else complete &&= collectTopLevelSchemaProperties(child, variants);
		}
	}
	return complete;
}

function parseRequestSchema(source, path) {
	const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	let initializer = null;
	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === 'paramDef');
		if (declaration?.initializer != null) initializer = unwrapExpression(declaration.initializer);
	}
	if (initializer == null || !ts.isObjectLiteralExpression(initializer)) return null;

	const variants = [];
	let complete = collectTopLevelSchemaProperties(initializer, variants);
	if (variants.length === 0 || variants.some(variant => !ts.isObjectLiteralExpression(variant))) return null;

	const keys = new Set();
	for (const variant of variants) {
		const parsed = schemaObjectKeys(variant);
		for (const key of parsed.keys) keys.add(key);
		complete &&= parsed.complete;
	}
	return { keys, complete };
}

function extractScript(source, path) {
	if (extname(path) !== '.vue') return { source, lineOffset: 0 };
	const match = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i.exec(source);
	if (match == null) return null;
	const contentOffset = match.index + match[0].indexOf(match[1]);
	return { source: match[1], lineOffset: lineNumber(source, contentOffset) - 1 };
}

function requestObjects(source, path) {
	const script = extractScript(source, path);
	if (script == null) return [];
	const sourceFile = ts.createSourceFile(path, script.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const found = [];
	function visit(node) {
		if (ts.isObjectLiteralExpression(node)) {
			const endpointProperty = objectProperty(node, 'endpoint');
			const endpointValue = endpointProperty == null ? null : unwrapExpression(endpointProperty.initializer);
			if (endpointValue != null && (ts.isStringLiteral(endpointValue) || ts.isNoSubstitutionTemplateLiteral(endpointValue))) {
				const paramsProperty = objectProperty(node, 'params');
				let paramsValue = paramsProperty == null ? null : unwrapExpression(paramsProperty.initializer);
				if (paramsValue != null && (ts.isArrowFunction(paramsValue) || ts.isFunctionExpression(paramsValue))) {
					paramsValue = unwrapExpression(paramsValue.body);
				}
				const implicitKeys = endpointValue.text === 'pinned-users'
					? []
					: ['limit', ['users', 'hashtags/users'].includes(endpointValue.text) ? 'offset' : 'untilId'];
				if (paramsValue == null || ts.isObjectLiteralExpression(paramsValue)) {
					const params = paramsValue == null ? { keys: new Set() } : schemaObjectKeys(paramsValue);
					indirectRequests.push({
						endpoint: endpointValue.text,
						keys: [...new Set([...implicitKeys, ...params.keys])],
						file: normalizePath(path),
						line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + script.lineOffset,
					});
				} else {
					nonInlineIndirectRequests.push({
						endpoint: endpointValue.text,
						expression: paramsValue.getText(sourceFile),
						file: normalizePath(path),
						line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + script.lineOffset,
					});
				}
			}
		}
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
			&& node.expression.name.text === 'api' && node.arguments.length >= 2) {
			const receiver = node.expression.getText(sourceFile);
			const endpointNode = node.arguments[0];
			const requestNode = unwrapExpression(node.arguments[1]);
			if (/^(?:this\.\$root|\$root|os)\.api$/.test(receiver)
				&& (ts.isStringLiteral(endpointNode) || ts.isNoSubstitutionTemplateLiteral(endpointNode))
				&& ts.isObjectLiteralExpression(requestNode)) {
				const request = schemaObjectKeys(requestNode);
				found.push({
					endpoint: endpointNode.text,
					keys: [...request.keys],
					file: normalizePath(path),
					line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + script.lineOffset,
				});
			} else if (/^(?:this\.\$root|\$root|os)\.api$/.test(receiver)
				&& (ts.isStringLiteral(endpointNode) || ts.isNoSubstitutionTemplateLiteral(endpointNode))) {
				nonInlineRequests.push({
					endpoint: endpointNode.text,
					expression: requestNode.getText(sourceFile),
					file: normalizePath(path),
					line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 + script.lineOffset,
				});
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return found;
}

const endpointList = await readFile(endpointListPath, 'utf8');
const endpointModules = new Map(
	[...endpointList.matchAll(/export \* as '([^']+)' from '([^']+)'/g)]
		.map(match => [match[1], resolve(dirname(endpointListPath), match[2].replace(/\.js$/, '.ts'))]),
);
const currentEndpoints = new Set(endpointModules.keys());
const files = [
	...(await walk(resolve(packageRoot, 'src'))),
	...(await walk(clientRoot)),
].filter(file => !excludedUnbundledFiles.has(normalizePath(file)));
const streamConnection = await readFile(streamConnectionPath, 'utf8');
const currentStreamChannels = new Set(
	[...streamConnection.matchAll(/case '([^']+)': return \w+Channel;/g)].map(match => match[1]),
);

const calls = [];
const dynamicCalls = [];
const directTransports = [];
const streamConnections = [];
const inlineRequests = [];
const nonInlineRequests = [];
const indirectRequests = [];
const nonInlineIndirectRequests = [];

for (const file of files) {
	const source = await readFile(file, 'utf8');
	const path = normalizePath(file);
	const lines = source.split(/\r?\n/);
	inlineRequests.push(...requestObjects(source, file));

	for (const match of source.matchAll(/\b(?:this\.\$root|\$root|os)\.api\s*\(\s*(['"`])([^'"`\r\n]+)\1/g)) {
		calls.push({ endpoint: match[2], file: path, line: lineNumber(source, match.index) });
	}
	for (const match of source.matchAll(/\b(?:useSharedConnection|connectToChannel)\s*\(\s*(['"`])([^'"`\r\n]+)\1/g)) {
		streamConnections.push({ channel: match[2], file: path, line: lineNumber(source, match.index) });
	}

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (/\b(?:this\.\$root|\$root|os)\.api\s*\(/.test(line)
			&& !/\b(?:this\.\$root|\$root|os)\.api\s*\(\s*['"`]/.test(line)) {
			dynamicCalls.push({ file: path, line: index + 1, source: line.trim() });
		}
		const directFetch = /(^|[^\w.$])fetch\s*\(/.test(line) && /(?:\/api(?:\/|['"`])|apiUrl)/.test(line);
		if ((directFetch || /new XMLHttpRequest\s*\(/.test(line)) && !transportFiles.has(path)) {
			directTransports.push({ file: path, line: index + 1, source: line.trim() });
		}
	}
}

const endpointCounts = new Map();
for (const call of calls) endpointCounts.set(call.endpoint, (endpointCounts.get(call.endpoint) ?? 0) + 1);
const unknownEndpoints = [...endpointCounts]
	.filter(([endpoint]) => !currentEndpoints.has(endpoint) && !specialApiRoutes.has(endpoint))
	.map(([endpoint, count]) => ({ endpoint, count }))
	.sort((a, b) => a.endpoint.localeCompare(b.endpoint));
const unexpectedDynamicCalls = dynamicCalls.filter(call => !reviewedDynamicFiles.has(call.file));
const reviewedDynamicCalls = dynamicCalls.filter(call => reviewedDynamicFiles.has(call.file));
const unknownStreamChannels = streamConnections
	.filter(connection => !currentStreamChannels.has(connection.channel));
const requestSchemas = new Map();
for (const endpoint of new Set([...inlineRequests, ...indirectRequests].map(request => request.endpoint))) {
	const modulePath = endpointModules.get(endpoint);
	if (modulePath == null) continue;
	requestSchemas.set(endpoint, parseRequestSchema(await readFile(modulePath, 'utf8'), modulePath));
}
const unknownRequestKeys = inlineRequests.flatMap(request => {
	const schema = requestSchemas.get(request.endpoint);
	if (schema == null || !schema.complete) return [];
	return request.keys
		.filter(key => !schema.keys.has(key))
		.map(key => ({ ...request, key, allowed: [...schema.keys].sort() }));
});
const unknownIndirectRequestKeys = indirectRequests.flatMap(request => {
	const schema = requestSchemas.get(request.endpoint);
	if (schema == null || !schema.complete) return [];
	return request.keys
		.filter(key => !schema.keys.has(key))
		.map(key => ({ ...request, key, allowed: [...schema.keys].sort() }));
});
const reviewedNonInlineRequests = nonInlineRequests.filter(request =>
	(request.endpoint === 'admin/announcements/create' && request.expression === 'data')
	|| (request.endpoint === 'drive/files/show' && request.expression.includes('? { url:'))
	|| (request.endpoint === 'users/show' && (request.expression.startsWith('parseAcct(') || request.expression === 'query'))
	|| (['i/2fa/register', 'i/2fa/unregister', 'i/2fa/register-key'].includes(request.endpoint) && request.expression === 'auth')
	|| (['pages/create', 'pages/update'].includes(request.endpoint) && request.expression === 'options'),
);
const unreviewedNonInlineRequests = nonInlineRequests.filter(request => !reviewedNonInlineRequests.includes(request));
const reviewedNonInlineIndirectRequests = nonInlineIndirectRequests.filter(request =>
	request.endpoint === 'notes/search' && request.expression.startsWith('genSearchQuery('),
);
const unreviewedNonInlineIndirectRequests = nonInlineIndirectRequests
	.filter(request => !reviewedNonInlineIndirectRequests.includes(request));

const report = {
	currentEndpointCount: currentEndpoints.size,
	literalCallCount: calls.length,
	uniqueLiteralEndpointCount: endpointCounts.size,
	unknownEndpoints,
	reviewedDynamicCalls,
	unexpectedDynamicCalls,
	unknownStreamChannels,
	directTransports,
	unknownRequestKeys,
	reviewedNonInlineRequests,
	unreviewedNonInlineRequests,
	unknownIndirectRequestKeys,
	reviewedNonInlineIndirectRequests,
	unreviewedNonInlineIndirectRequests,
};

if (process.argv.includes('--json')) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(`Current backend endpoints: ${report.currentEndpointCount}`);
	console.log(`v11 literal API calls: ${report.literalCallCount} (${report.uniqueLiteralEndpointCount} unique)`);
	console.log(`Unknown endpoint names: ${unknownEndpoints.length}`);
	for (const item of unknownEndpoints) console.log(`  ${item.endpoint} (${item.count})`);
	console.log(`Reviewed generic API calls: ${reviewedDynamicCalls.length}`);
	for (const item of reviewedDynamicCalls) console.log(`  ${item.file}:${item.line} ${item.source}`);
	console.log(`Unexpected dynamic API calls: ${unexpectedDynamicCalls.length}`);
	for (const item of unexpectedDynamicCalls) console.log(`  ${item.file}:${item.line} ${item.source}`);
	console.log(`Unknown streaming channels: ${unknownStreamChannels.length}`);
	for (const item of unknownStreamChannels) console.log(`  ${item.file}:${item.line} ${item.channel}`);
	console.log(`Direct transports outside the current adapter/uploaders: ${directTransports.length}`);
	for (const item of directTransports) console.log(`  ${item.file}:${item.line} ${item.source}`);
	console.log(`Unknown inline request keys: ${unknownRequestKeys.length}`);
	for (const item of unknownRequestKeys) {
		console.log(`  ${item.file}:${item.line} ${item.endpoint}.${item.key} (allowed: ${item.allowed.join(', ')})`);
	}
	console.log(`Reviewed literal calls with non-inline request data: ${reviewedNonInlineRequests.length}`);
	console.log(`Unreviewed literal calls with non-inline request data: ${unreviewedNonInlineRequests.length}`);
	for (const item of unreviewedNonInlineRequests) {
		console.log(`  ${item.file}:${item.line} ${item.endpoint} <- ${item.expression}`);
	}
	console.log(`Unknown indirect paging request keys: ${unknownIndirectRequestKeys.length}`);
	for (const item of unknownIndirectRequestKeys) {
		console.log(`  ${item.file}:${item.line} ${item.endpoint}.${item.key} (allowed: ${item.allowed.join(', ')})`);
	}
	console.log(`Reviewed paging configs with non-inline params: ${reviewedNonInlineIndirectRequests.length}`);
	console.log(`Unreviewed paging configs with non-inline params: ${unreviewedNonInlineIndirectRequests.length}`);
	for (const item of unreviewedNonInlineIndirectRequests) {
		console.log(`  ${item.file}:${item.line} ${item.endpoint} <- ${item.expression}`);
	}
}

if (unknownEndpoints.length > 0 || unexpectedDynamicCalls.length > 0
	|| unknownStreamChannels.length > 0 || directTransports.length > 0 || unknownRequestKeys.length > 0
	|| unknownIndirectRequestKeys.length > 0 || unreviewedNonInlineRequests.length > 0
	|| unreviewedNonInlineIndirectRequests.length > 0) {
	process.exitCode = 1;
}
