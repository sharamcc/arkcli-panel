import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWriteList, DEFAULT_WRITE_CIDRS, isWriteAllowed } from '../src/config/write-allow.js';

test('默认白名单放行内网与本机', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '192.168.9.211'), true);
  assert.equal(isWriteAllowed(list, '192.168.9.42'), true);
  assert.equal(isWriteAllowed(list, '127.0.0.1'), true);
  assert.equal(isWriteAllowed(list, '::1'), true);
});

test('默认白名单拒绝其他网段', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '10.0.0.5'), false);
  assert.equal(isWriteAllowed(list, '192.168.10.1'), false);
});

test('IPv4-mapped IPv6 地址判定', () => {
  const list = buildWriteList(DEFAULT_WRITE_CIDRS);
  assert.equal(isWriteAllowed(list, '::ffff:127.0.0.1'), true);
  assert.equal(isWriteAllowed(list, '::FFFF:127.0.0.1'), true);
  assert.equal(isWriteAllowed(list, '::ffff:10.0.0.5'), false);
});

test('0.0.0.0/0 放行任意 IPv4', () => {
  const list = buildWriteList('0.0.0.0/0');
  assert.equal(isWriteAllowed(list, '8.8.8.8'), true);
  assert.equal(isWriteAllowed(list, '10.0.0.5'), true);
  assert.equal(isWriteAllowed(list, '::1'), false);
});

test('空 CIDR 拒绝所有地址', () => {
  const empty = buildWriteList('');
  assert.equal(isWriteAllowed(empty, '127.0.0.1'), false);
  assert.equal(isWriteAllowed(empty, '192.168.9.1'), false);
});

test('自定义值整体替换默认值', () => {
  const list = buildWriteList('10.0.0.0/8');
  assert.equal(isWriteAllowed(list, '10.1.2.3'), true);
  assert.equal(isWriteAllowed(list, '192.168.9.5'), false);
});

test('非法 CIDR 抛错', () => {
  assert.throws(() => buildWriteList('192.168.9.0/33'));
  assert.throws(() => buildWriteList('not-a-cidr'));
  assert.throws(() => buildWriteList('192.168.9.0/'));
  assert.throws(() => buildWriteList('10.0.0.0/8/0'));
  assert.throws(() => buildWriteList('10.0.0.0/0x10'));
});
