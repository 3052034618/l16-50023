import { Template, TemplateContent, ChannelType } from '../types';
import { templateRepo, templateContentRepo } from '../database/store';

export class TemplateService {
  createTemplate(data: {
    name: string;
    description?: string;
    category?: string;
    priority?: string;
  }): Template {
    return templateRepo.create(data);
  }

  getTemplate(id: string): Template | undefined {
    return templateRepo.get(id);
  }

  listTemplates(params?: { category?: string; status?: string; page?: number; pageSize?: number }): {
    items: Template[];
    total: number;
  } {
    return templateRepo.list(params as any);
  }

  updateTemplate(id: string, data: {
    name?: string;
    description?: string;
    category?: string;
    priority?: string;
  }): Template | undefined {
    return templateRepo.update(id, data);
  }

  publishTemplate(id: string): Template | undefined {
    return templateRepo.publish(id);
  }

  unpublishTemplate(id: string): Template | undefined {
    return templateRepo.unpublish(id);
  }

  newVersion(id: string): Template | undefined {
    return templateRepo.newVersion(id);
  }

  rollbackVersion(id: string, targetVersion: number): Template | undefined {
    return templateRepo.rollback(id, targetVersion);
  }

  getVersions(template_id: string): number[] {
    return templateContentRepo.getVersions(template_id);
  }

  deleteTemplate(id: string): boolean {
    return templateRepo.delete(id);
  }

  addTemplateContent(data: {
    template_id: string;
    language: string;
    channel: ChannelType;
    subject?: string;
    content: string;
  }): TemplateContent {
    return templateContentRepo.upsert(data);
  }

  getTemplateContent(
    template_id: string,
    language: string,
    channel: ChannelType
  ): TemplateContent | undefined {
    return templateContentRepo.get(template_id, language, channel);
  }

  getTemplateContents(template_id: string, version?: number): TemplateContent[] {
    return templateContentRepo.listByTemplate(template_id, version);
  }

  deleteTemplateContent(id: number): boolean {
    return templateContentRepo.delete(id);
  }

  renderTemplate(
    template_id: string,
    language: string,
    channel: ChannelType,
    params: Record<string, any> = {},
    version?: number
  ): { subject?: string; content: string } | undefined {
    const content = templateContentRepo.findBestMatch(template_id, language, channel, version);
    if (!content) return undefined;

    const subject = content.subject ? this.replaceVariables(content.subject, params) : undefined;
    const renderedContent = this.replaceVariables(content.content, params);

    return { subject, content: renderedContent };
  }

  private replaceVariables(template: string, params: Record<string, any>): string {
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
      if (params.hasOwnProperty(key)) {
        return String(params[key]);
      }
      return match;
    });
  }
}

export const templateService = new TemplateService();
