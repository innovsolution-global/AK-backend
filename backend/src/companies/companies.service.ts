import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateCompanyDto,
  QueryCompaniesDto,
  UpdateCompanyDto,
} from './dto/company.dto';

const COMPANY_SELECT = {
  id: true,
  name: true,
  registrationNumber: true,
  taxNumber: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  contactPerson: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { projects: { where: { deletedAt: null } } } },
} satisfies Prisma.CompanySelect;

const SORTABLE = ['name', 'createdAt', 'updatedAt'] as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryCompaniesDto) {
    const where: Prisma.CompanyWhereInput = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { registrationNumber: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        select: COMPANY_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'name'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: COMPANY_SELECT,
    });

    if (!company) throw this.notFound();
    return company;
  }

  async findProjects(id: string) {
    await this.findOne(id);

    return this.prisma.project.findMany({
      where: { companyId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        startDate: true,
        expectedEndDate: true,
        location: { select: { id: true, name: true } },
      },
    });
  }

  async create(
    dto: CreateCompanyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertRegistrationNumberIsFree(dto.registrationNumber);

    const company = await this.prisma.company.create({
      data: { ...dto },
      select: COMPANY_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Company',
      entityId: company.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { name: dto.name },
    });

    return company;
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOne(id);
    await this.assertRegistrationNumberIsFree(dto.registrationNumber, id);

    const company = await this.prisma.company.update({
      where: { id },
      data: { ...dto },
      select: COMPANY_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'Company',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return company;
  }

  /**
   * Suppression logique, refusée tant que des projets actifs y sont rattachés :
   * ces projets afficheraient sinon un gérant introuvable.
   */
  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const company = await this.findOne(id);

    if (company._count.projects > 0) {
      throw new ConflictException({
        message: `Suppression impossible : ${company._count.projects} projet(s) sont rattachés à cette entreprise.`,
        error: 'CONFLICT',
      });
    }

    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.DELETE,
      entity: 'Company',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { name: company.name },
    });
  }

  private async assertRegistrationNumberIsFree(
    registrationNumber: string | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!registrationNumber) return;

    const existing = await this.prisma.company.findFirst({
      where: {
        registrationNumber,
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        message: "Ce numéro d'enregistrement est déjà utilisé.",
        error: 'CONFLICT',
        details: [
          { field: 'registrationNumber', message: 'Numéro déjà utilisé' },
        ],
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Cette entreprise n'existe pas.",
      error: 'NOT_FOUND',
    });
  }
}
