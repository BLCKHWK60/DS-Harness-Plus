import test from 'node:test';
import assert from 'node:assert/strict';
import { languageOf, looksMinified, parseFile } from '../lib/parse.js';

/** @param {object} out @returns {string[]} `kind name` or `kind Parent.name` per symbol. */
const names = (out) => out.symbols.map((s) => `${s.kind} ${s.parent ? `${s.parent}.` : ''}${s.name}`);
/** @param {object} out @param {string} name @returns {object} one symbol. */
const sym = (out, name) => out.symbols.find((s) => s.name === name);

test('language is taken from the name, or the first line of a script', () => {
  assert.equal(languageOf('a/b.tsx'), 'TypeScript');
  assert.equal(languageOf('Makefile'), 'Makefile');
  assert.equal(languageOf('bin/run', '#!/usr/bin/env bash'), 'Shell');
  assert.equal(languageOf('bin/tool', '#!/usr/bin/env python3'), 'Python');
  assert.equal(languageOf('data.xyz'), 'Other');
});

test('JavaScript and TypeScript: functions, classes, methods, types, imports', () => {
  const out = parseFile('src/a.ts', [
    '// Loads users.',
    "import { x } from './x.js';",
    "import type { Y } from '../types';",
    "import 'side-effect';",
    "export * from './barrel';",
    "const fs = require('node:fs');",
    'export async function load(id: string, options = {}) {',
    '  const mod = await import("./lazy");',
    '  return mod;',
    '}',
    'export class Store extends Base {',
    '  private items = new Map();',
    '  constructor(private db: Db) {',
    '    super();',
    '  }',
    '  async get(id: string): Promise<Item> {',
    '    if (id) {',
    '      return this.items.get(id);',
    '    }',
    '  }',
    '  static create() {',
    '    return new Store(null);',
    '  }',
    '}',
    'export interface Item { id: string }',
    'export type Id = string;',
    'export const handler = async (req, res) => {',
    '  res.end();',
    '};',
    'const MAX_ITEMS = 10;',
    'export const config = { a: 1 };',
    'module.exports.legacy = function () {};',
  ].join('\n'));
  assert.equal(out.lang, 'TypeScript');
  assert.equal(out.note, 'Loads users.');
  assert.deepEqual(out.imports.sort(), ['../types', './barrel', './lazy', './x.js', 'node:fs', 'side-effect']);
  const list = names(out);
  for (const want of ['function load', 'class Store', 'method Store.constructor', 'method Store.get', 'method Store.create', 'type Item', 'type Id', 'function handler', 'const MAX_ITEMS', 'const config', 'export legacy']) {
    assert.ok(list.includes(want), `missing ${want} in ${list.join(' | ')}`);
  }
  // A default value written as {} is not the function body.
  assert.equal(sym(out, 'load').line, 7);
  assert.equal(sym(out, 'load').end, 10);
  assert.equal(sym(out, 'Store').end, 24);
  assert.equal(sym(out, 'get').end, 20);
  // Statements inside a method are not methods.
  assert.ok(!list.some((item) => / (if|return|super)$/.test(item)));
});

test('JSX components and CommonJS', () => {
  const out = parseFile('ui/App.jsx', [
    "const React = require('react');",
    'function App({ title }) {',
    '  return <div className="a">{title}</div>;',
    '}',
    'const Row = ({ item }) => <li>{item}</li>;',
    'exports.App = App;',
  ].join('\n'));
  assert.deepEqual(out.imports, ['react']);
  assert.ok(names(out).includes('function App'));
  assert.ok(names(out).includes('function Row'));
  assert.equal(sym(out, 'App').end, 4);
});

test('Python: functions, classes, methods, constants, imports', () => {
  const out = parseFile('pkg/mod.py', [
    '"""Billing helpers."""',
    'import os, sys',
    'from . import sibling',
    'from ..core.db import connect',
    'from requests import get',
    'LIMIT = 5',
    'class Invoice(Base):',
    '    def total(self):',
    '        return 1',
    '    async def send(self, to):',
    '        pass',
    '',
    'def helper(a, b=2):',
    '    def inner():',
    '        return a',
    '    return inner',
  ].join('\n'));
  assert.deepEqual(out.imports.sort(), ['.', '..core.db', 'os', 'requests', 'sys']);
  const list = names(out);
  for (const want of ['const LIMIT', 'class Invoice', 'method Invoice.total', 'method Invoice.send', 'function helper', 'function inner']) {
    assert.ok(list.includes(want), `missing ${want}`);
  }
  assert.equal(sym(out, 'Invoice').end, 11);
  assert.equal(sym(out, 'helper').end, 16);
});

test('Go: package, functions, methods, types, imports', () => {
  const out = parseFile('svc/server.go', [
    'package svc',
    'import (',
    '  "fmt"',
    '  log "example.com/app/internal/log"',
    ')',
    'import "os"',
    'type Server struct {',
    '  port int',
    '}',
    'func New(port int) *Server {',
    '  return &Server{port: port}',
    '}',
    'func (s *Server) Start() error {',
    '  return nil',
    '}',
    'const Version = "1"',
  ].join('\n'));
  assert.equal(out.pkg, 'svc');
  assert.deepEqual(out.imports.sort(), ['example.com/app/internal/log', 'fmt', 'os']);
  assert.deepEqual(names(out), ['type Server', 'function New', 'method Server.Start', 'const Version']);
  assert.equal(sym(out, 'New').end, 12);
});

test('Rust: functions, types, impl methods, mods and uses', () => {
  const out = parseFile('src/lib.rs', [
    'mod parser;',
    'pub mod util;',
    'use crate::parser::Token;',
    'use std::collections::HashMap;',
    'pub struct Engine {',
    '    map: HashMap<String, u8>,',
    '}',
    'impl Engine {',
    '    pub fn new() -> Self {',
    '        Engine { map: HashMap::new() }',
    '    }',
    '    pub async fn run(&self) {}',
    '}',
    'pub trait Runner {',
    '    fn go(&self);',
    '}',
    'pub fn free(x: u8) -> u8 { x }',
    'pub const LIMIT: usize = 4;',
  ].join('\n'));
  assert.deepEqual(out.imports.sort(), ['crate::parser::Token', 'mod:parser', 'mod:util', 'std::collections::HashMap']);
  const list = names(out);
  for (const want of ['type Engine', 'method Engine.new', 'method Engine.run', 'class Runner', 'method Runner.go', 'function free', 'const LIMIT']) {
    assert.ok(list.includes(want), `missing ${want} in ${list.join(' | ')}`);
  }
});

test('Java and Kotlin: package, classes, methods, imports', () => {
  const java = parseFile('src/com/acme/Shop.java', [
    'package com.acme;',
    'import com.acme.model.Item;',
    'import java.util.List;',
    'public class Shop {',
    '    private final List<Item> items;',
    '    public Shop(List<Item> items) {',
    '        this.items = items;',
    '    }',
    '    public static int count(List<Item> items) {',
    '        if (items == null) {',
    '            return 0;',
    '        }',
    '        return items.size();',
    '    }',
    '}',
  ].join('\n'));
  assert.equal(java.pkg, 'com.acme');
  assert.deepEqual(java.imports, ['com.acme.model.Item', 'java.util.List']);
  assert.deepEqual(names(java), ['class Shop', 'method Shop.Shop', 'method Shop.count']);
  const kotlin = parseFile('src/Main.kt', [
    'package app',
    'import app.data.Repo',
    'data class User(val id: Int)',
    'class Service(private val repo: Repo) {',
    '    suspend fun load(id: Int): User {',
    '        return repo.get(id)',
    '    }',
    '}',
    'fun main() {',
    '    println("hi")',
    '}',
  ].join('\n'));
  assert.deepEqual(names(kotlin), ['class User', 'class Service', 'method Service.load', 'function main']);
});

test('C, C++ and Objective-C: sources and headers', () => {
  const c = parseFile('src/util.c', [
    '#include "util.h"',
    '#include <stdio.h>',
    '#define MAX_LEN 64',
    'static int add(int a, int b) {',
    '    return a + b;',
    '}',
    'int',
    'main(int argc, char **argv)',
    '{',
    '    if (argc > 1) {',
    '        return add(1, 2);',
    '    }',
    '    return 0;',
    '}',
    'int declared_only(int a);',
  ].join('\n'));
  assert.deepEqual(c.imports.sort(), ['<stdio.h>', 'util.h']);
  assert.deepEqual(names(c), ['macro MAX_LEN', 'function add', 'function main']);
  const header = parseFile('include/util.h', [
    '#ifndef UTIL_H',
    '#define UTIL_H',
    'typedef struct point point_t;',
    'struct point {',
    '    int x;',
    '};',
    'int add(int a, int b);',
    '#endif',
  ].join('\n'));
  assert.deepEqual(names(header), ['type point_t', 'type point', 'function add']);
  const cpp = parseFile('src/shape.cpp', [
    '#include "shape.hpp"',
    'namespace geo {',
    'class Circle {',
    '};',
    'double Circle::area() const {',
    '    return 3.14;',
    '}',
    '}',
  ].join('\n'));
  assert.ok(names(cpp).includes('namespace geo'));
  assert.ok(names(cpp).includes('type Circle'));
  assert.ok(names(cpp).includes('method Circle.area'));
  const objc = parseFile('App/View.m', [
    '#import "View.h"',
    '@implementation View',
    '- (void)draw:(CGRect)rect {',
    '}',
    '+ (instancetype)make {',
    '    return nil;',
    '}',
    '@end',
  ].join('\n'));
  assert.deepEqual(names(objc), ['method View.draw', 'method View.make']);
});

test('Swift, Ruby, PHP, C#', () => {
  const swift = parseFile('Sources/Store.swift', [
    'import Foundation',
    'public final class Store {',
    '    init(name: String) {',
    '    }',
    '    func load(id: Int) -> Item? {',
    '        return nil',
    '    }',
    '}',
    'struct Item {}',
    'func helper() {}',
  ].join('\n'));
  assert.deepEqual(swift.imports, ['Foundation']);
  assert.deepEqual(names(swift), ['class Store', 'method Store.init', 'method Store.load', 'class Item', 'function helper']);

  const ruby = parseFile('lib/shop.rb', [
    "require 'json'",
    "require_relative 'item'",
    'module Shop',
    '  class Cart',
    '    def add(item)',
    '      @items << item',
    '    end',
    '    def self.empty?',
    '      true',
    '    end',
    '  end',
    'end',
  ].join('\n'));
  assert.deepEqual(ruby.imports.sort(), ['./item', 'json']);
  assert.deepEqual(names(ruby), ['class Shop', 'class Cart', 'method Cart.add', 'method Cart.empty?']);
  assert.equal(sym(ruby, 'Cart').end, 11);

  const php = parseFile('src/Mailer.php', [
    '<?php',
    'namespace App\\Mail;',
    'use App\\Model\\User;',
    "require_once __DIR__ . '/helpers.php';",
    'final class Mailer {',
    '    public function send(User $to): bool {',
    '        return true;',
    '    }',
    '}',
    'function plain_helper() {}',
  ].join('\n'));
  assert.equal(php.pkg, 'App.Mail');
  assert.deepEqual(php.imports.sort(), ['./helpers.php', 'App.Model.User']);
  assert.deepEqual(names(php), ['class Mailer', 'method Mailer.send', 'function plain_helper']);

  const cs = parseFile('App/Service.cs', [
    'using System.Linq;',
    'namespace App.Core',
    '{',
    '    public class Service',
    '    {',
    '        public async Task<int> RunAsync(string name)',
    '        {',
    '            return 1;',
    '        }',
    '    }',
    '}',
  ].join('\n'));
  assert.equal(cs.pkg, 'App.Core');
  assert.deepEqual(cs.imports, ['System.Linq']);
  assert.deepEqual(names(cs), ['class Service', 'method Service.RunAsync']);
});

test('shell scripts and Markdown headings', () => {
  const sh = parseFile('scripts/run.sh', [
    '#!/bin/bash',
    '# Runs the checks.',
    'source ./common.sh',
    '. "$HERE/lib.sh"',
    'say() {',
    '  echo "$1"',
    '}',
    'function fail {',
    '  exit 1',
    '}',
  ].join('\n'));
  assert.equal(sh.note, 'Runs the checks.');
  assert.deepEqual(sh.imports, ['./common.sh', '$HERE/lib.sh']);
  assert.deepEqual(names(sh), ['function say', 'function fail']);
  const md = parseFile('docs/guide.md', ['# Guide', 'text', '## Install', '```', '# not a heading', '```', '### Mac', '## Use'].join('\n'));
  assert.deepEqual(names(md), ['h1 Guide', 'h2 Install', 'h3 Mac', 'h2 Use']);
  assert.equal(sym(md, 'Install').end, 7);
});

test('other files are listed without an outline, and minified text is not parsed', () => {
  const other = parseFile('conf/app.toml', '# Main settings\n[server]\nport = 1\n');
  assert.equal(other.lang, 'TOML');
  assert.equal(other.note, 'Main settings');
  assert.deepEqual(other.symbols, []);
  const blob = `function a(){${'x=1;'.repeat(3000)}}`;
  assert.equal(looksMinified(blob), true);
  assert.deepEqual(parseFile('a.js', blob).symbols, []);
});

test('a very long file cannot produce an unbounded outline', () => {
  const text = Array.from({ length: 1000 }, (_, n) => `function f${n}() {}`).join('\n');
  assert.equal(parseFile('big.js', text).symbols.length, 400);
});
