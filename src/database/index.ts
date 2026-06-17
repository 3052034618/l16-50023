import { v4 as uuidv4 } from 'uuid';

interface TableData {
  [key: string]: any[];
}

class Statement {
  private tableName: string;
  private db: Database;
  private sql: string;
  private type: 'select' | 'insert' | 'update' | 'delete' | 'create';

  constructor(db: Database, sql: string) {
    this.db = db;
    this.sql = sql.trim();
    const upperSql = this.sql.toUpperCase();
    if (upperSql.startsWith('SELECT')) {
      this.type = 'select';
    } else if (upperSql.startsWith('INSERT')) {
      this.type = 'insert';
    } else if (upperSql.startsWith('UPDATE')) {
      this.type = 'update';
    } else if (upperSql.startsWith('DELETE')) {
      this.type = 'delete';
    } else {
      this.type = 'create';
    }

    const match = this.sql.match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/i);
    if (match) {
      this.tableName = match[1] || match[2] || match[3] || '';
    } else {
      this.tableName = '';
    }
  }

  get(...params: any[]): any {
    const results = this.all(...params);
    return results.length > 0 ? results[0] : undefined;
  }

  all(...params: any[]): any[] {
    const table = this.db.tables[this.tableName];
    if (!table || this.type !== 'select') {
      return [];
    }

    let rows = [...table];
    const whereClause = this.extractWhere();
    if (whereClause) {
      rows = rows.filter(row => this.evaluateWhere(whereClause, row, params));
    }

    const orderBy = this.extractOrderBy();
    if (orderBy) {
      rows = this.applyOrderBy(rows, orderBy);
    }

    const limitOffset = this.extractLimitOffset();
    if (limitOffset) {
      const { limit, offset } = limitOffset;
      rows = rows.slice(offset, offset + limit);
    }

    return rows;
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number | string } {
    const table = this.db.tables[this.tableName];
    if (!table) {
      return { changes: 0, lastInsertRowid: 0 };
    }

    if (this.type === 'insert') {
      return this.handleInsert(params);
    } else if (this.type === 'update') {
      return this.handleUpdate(params);
    } else if (this.type === 'delete') {
      return this.handleDelete(params);
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  private handleInsert(params: any[]): { changes: number; lastInsertRowid: number | string } {
    const table = this.db.tables[this.tableName];
    const columnsMatch = this.sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!columnsMatch) {
      return { changes: 0, lastInsertRowid: 0 };
    }

    const columns = columnsMatch[1].split(',').map(c => c.trim());
    const valuesMatch = this.sql.match(/VALUES\s*\(([^)]+)\)/i);
    
    const row: any = {};
    let paramIndex = 0;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (valuesMatch) {
        const valuePart = valuesMatch[1].split(',')[i]?.trim();
        if (valuePart === '?') {
          row[col] = params[paramIndex++];
        } else if (valuePart?.toUpperCase() === 'NULL') {
          row[col] = null;
        } else if (valuePart?.startsWith("'") && valuePart?.endsWith("'")) {
          row[col] = valuePart.slice(1, -1);
        } else {
          row[col] = valuePart;
        }
      } else {
        row[col] = params[paramIndex++];
      }
    }

    const hasAutoId = !row.id && table.length > 0 && typeof table[0].id === 'number';
    if (hasAutoId) {
      const maxId = table.reduce((max, r) => Math.max(max, r.id || 0), 0);
      row.id = maxId + 1;
    } else if (!row.id && columns.includes('id')) {
      row.id = uuidv4();
    }

    table.push(row);
    return { changes: 1, lastInsertRowid: row.id };
  }

  private handleUpdate(params: any[]): { changes: number; lastInsertRowid: number | string } {
    const table = this.db.tables[this.tableName];
    const setClause = this.sql.match(/SET\s+(.+?)\s+WHERE/i) || this.sql.match(/SET\s+(.+)$/i);
    if (!setClause) {
      return { changes: 0, lastInsertRowid: 0 };
    }

    const assignments = this.parseSetClause(setClause[1]);
    const whereClause = this.extractWhere();
    
    let changes = 0;
    let paramIndex = 0;

    for (const row of table) {
      if (!whereClause || this.evaluateWhere(whereClause, row, params)) {
        for (const { column, value, isParam } of assignments) {
          if (isParam) {
            row[column] = params[paramIndex++];
          } else {
            row[column] = value;
          }
        }
        changes++;
      }
    }

    return { changes, lastInsertRowid: 0 };
  }

  private handleDelete(params: any[]): { changes: number; lastInsertRowid: number | string } {
    const table = this.db.tables[this.tableName];
    const whereClause = this.extractWhere();
    
    const originalLength = table.length;
    
    if (!whereClause) {
      this.db.tables[this.tableName] = [];
      return { changes: originalLength, lastInsertRowid: 0 };
    }

    this.db.tables[this.tableName] = table.filter(row => 
      !this.evaluateWhere(whereClause, row, params)
    );

    return { changes: originalLength - this.db.tables[this.tableName].length, lastInsertRowid: 0 };
  }

  private parseSetClause(clause: string): { column: string; value: any; isParam: boolean }[] {
    const parts = clause.split(',').map(p => p.trim());
    return parts.map(part => {
      const [col, val] = part.split('=').map(s => s.trim());
      if (val === '?') {
        return { column: col, value: null, isParam: true };
      } else if (val.toUpperCase() === 'NULL') {
        return { column: col, value: null, isParam: false };
      } else if (val.startsWith("'") && val.endsWith("'")) {
        return { column: col, value: val.slice(1, -1), isParam: false };
      } else if (!isNaN(Number(val))) {
        return { column: col, value: Number(val), isParam: false };
      } else {
        return { column: col, value: val, isParam: false };
      }
    });
  }

  private extractWhere(): string | null {
    const match = this.sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
    return match ? match[1].trim() : null;
  }

  private extractOrderBy(): string | null {
    const match = this.sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/i);
    return match ? match[1].trim() : null;
  }

  private extractLimitOffset(): { limit: number; offset: number } | null {
    const match = this.sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
    if (!match) return null;
    return {
      limit: parseInt(match[1]),
      offset: match[2] ? parseInt(match[2]) : 0
    };
  }

  private applyOrderBy(rows: any[], orderBy: string): any[] {
    const parts = orderBy.split(',').map(p => p.trim());
    const sortKeys = parts.map(p => {
      const [key, direction] = p.split(/\s+/);
      return { key: key.trim(), asc: !direction || direction.toUpperCase() === 'ASC' };
    });

    return [...rows].sort((a, b) => {
      for (const { key, asc } of sortKeys) {
        let valA = a[key];
        let valB = b[key];

        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
      }
      return 0;
    });
  }

  private evaluateWhere(where: string, row: any, params: any[]): boolean {
    let paramIndex = 0;
    
    const conditions = where.split(/\s+AND\s+/i).map(c => c.trim());
    
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, row, params, paramIndex)) {
        return false;
      }
    }
    
    return true;
  }

  private evaluateCondition(condition: string, row: any, params: any[], paramIndex: number): boolean {
    if (condition.toUpperCase().includes('IS NULL')) {
      const col = condition.replace(/\s+IS\s+NULL/i, '').trim();
      return row[col] === null || row[col] === undefined;
    }

    const operators = ['>=', '<=', '!=', '<>', '=', '>', '<'];
    for (const op of operators) {
      const parts = condition.split(op).map(p => p.trim());
      if (parts.length === 2) {
        const col = parts[0];
        let val: any;
        
        if (parts[1] === '?') {
          val = params[paramIndex];
        } else if (parts[1].startsWith("'") && parts[1].endsWith("'")) {
          val = parts[1].slice(1, -1);
        } else {
          val = parts[1];
        }

        const rowVal = row[col];
        
        switch (op) {
          case '=':
            return rowVal == val;
          case '!=':
          case '<>':
            return rowVal != val;
          case '>':
            return rowVal > val;
          case '<':
            return rowVal < val;
          case '>=':
            return rowVal >= val;
          case '<=':
            return rowVal <= val;
        }
      }
    }
    
    return true;
  }
}

class Database {
  tables: TableData = {};

  constructor() {
    this.tables = {
      templates: [],
      template_contents: [],
      users: [],
      user_preferences: [],
      message_queue: [],
      send_history: [],
      alerts: []
    };
  }

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  exec(sql: string): void {
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim().toUpperCase().startsWith('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
        if (match && !this.tables[match[1]]) {
          this.tables[match[1]] = [];
        }
      }
    }
  }

  pragma(_: string): void {}

  transaction(fn: () => void): () => void {
    return fn;
  }
}

let dbInstance: Database | null = null;

export function initDatabase(dbPath?: string): Database {
  dbInstance = new Database();
  createTables();
  return dbInstance;
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

function createTables() {
  if (!dbInstance) return;
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS templates;
    CREATE TABLE IF NOT EXISTS template_contents;
    CREATE TABLE IF NOT EXISTS users;
    CREATE TABLE IF NOT EXISTS user_preferences;
    CREATE TABLE IF NOT EXISTS message_queue;
    CREATE TABLE IF NOT EXISTS send_history;
    CREATE TABLE IF NOT EXISTS alerts;
  `);
}

export default dbInstance;
