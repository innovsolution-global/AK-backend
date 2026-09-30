import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { QueryNotificationsDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryNotificationsDto) {
    return this.notifications.findAll(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  markAsRead(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.notifications.markAsRead(user, params.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Tout marquer comme lu' })
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllAsRead(user);
  }
}
