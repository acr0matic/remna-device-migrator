import { UserInfo, HwidDevice } from './types';

/**
 * Интерфейс для работы с Remnawave API разных версий.
 * Реализуется классами RemnawaveClientV2 и RemnawaveClientV3.
 */
export interface RemnawaveClient {
  /**
   * Получить информацию о пользователе по short UUID.
   * @param shortUuid - короткий UUID из URL подписки
   * @returns UserInfo или null если пользователь не найден
   */
  getUserByShortUuid(shortUuid: string): Promise<UserInfo | null>;

  /**
   * Получить список HWID устройств пользователя.
   * @param userId - идентификатор пользователя (uuid для v2, number для v3)
   * @returns массив устройств
   */
  getUserDevices(userId: string | number): Promise<HwidDevice[]>;

  /**
   * Удалить HWID устройство пользователя.
   * @param userId - идентификатор пользователя (uuid для v2, number для v3)
   * @param hwid - HWID устройства для удаления
   * @returns true если удаление успешно
   */
  deleteDevice(userId: string | number, hwid: string): Promise<boolean>;
}
