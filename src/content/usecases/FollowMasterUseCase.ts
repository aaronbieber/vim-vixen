import FollowKeyRepository, { FollowKeyRepositoryImpl }
  from '../repositories/FollowKeyRepository';
import FollowMasterRepository, { FollowMasterRepositoryImpl }
  from '../repositories/FollowMasterRepository';
import FollowSlaveClient, { FollowSlaveClientImpl }
  from '../client/FollowSlaveClient';
import HintKeyProducer from './HintKeyProducer';
import SettingRepository, { SettingRepositoryImpl }
  from '../repositories/SettingRepository';

export default class FollowMasterUseCase {
  private followKeyRepository: FollowKeyRepository;

  private followMasterRepository: FollowMasterRepository;

  private settingRepository: SettingRepository;

  // TODO Make repository
  private producer: HintKeyProducer | null;

  constructor({
    followKeyRepository = new FollowKeyRepositoryImpl(),
    followMasterRepository = new FollowMasterRepositoryImpl(),
    settingRepository = new SettingRepositoryImpl(),
  } = {}) {
    this.followKeyRepository = followKeyRepository;
    this.followMasterRepository = followMasterRepository;
    this.settingRepository = settingRepository;
    this.producer = null;
  }

  startFollow(newTab: boolean, background: boolean): void {
    let hintchars = this.settingRepository.get().properties.hintchars;
    this.producer = new HintKeyProducer(hintchars);

    this.followKeyRepository.clearKeys();
    this.followMasterRepository.setCurrentFollowMode(newTab, background);

    let viewWidth = window.top.innerWidth;
    let viewHeight = window.top.innerHeight;
    new FollowSlaveClientImpl(window.top).requestHintCount(
      { width: viewWidth, height: viewHeight },
      { x: 0, y: 0 },
    );

    let frameElements = window.document.querySelectorAll('iframe');
    for (let i = 0; i < frameElements.length; ++i) {
      let ele = frameElements[i] as HTMLFrameElement | HTMLIFrameElement;
      let { left: frameX, top: frameY } = ele.getBoundingClientRect();
      new FollowSlaveClientImpl(ele.contentWindow!!).requestHintCount(
        { width: viewWidth, height: viewHeight },
        { x: frameX, y: frameY },
      );
    }
  }

  // eslint-disable-next-line max-statements
  createSlaveHints(count: number, sender: Window): void {
    let produced = [];
    for (let i = 0; i < count; ++i) {
      let tag = this.producer!!.produce();
      produced.push(tag);
      this.followMasterRepository.addTag(tag);
    }

    let doc = window.document;
    let viewWidth = window.innerWidth || doc.documentElement.clientWidth;
    let viewHeight = window.innerHeight || doc.documentElement.clientHeight;
    let pos = { x: 0, y: 0 };
    if (sender !== window) {
      let frameElements = window.document.querySelectorAll('iframe');
      let ele = Array.from(frameElements).find(e => e.contentWindow === sender);
      if (!ele) {
        // elements of the sender is gone
        return;
      }
      let { left: frameX, top: frameY } = ele.getBoundingClientRect();
      pos = { x: frameX, y: frameY };
    }
    new FollowSlaveClientImpl(sender).createHints(
      { width: viewWidth, height: viewHeight },
      pos,
      produced,
    );
  }

  cancelFollow(): void {
    this.followMasterRepository.clearTags();
    this.broadcastToSlaves((client) => {
      client.clearHints();
    });
  }

  filter(prefix: string): void {
    this.broadcastToSlaves((client) => {
      client.filterHints(prefix);
    });
  }

  activate(tag: string): void {
    this.followMasterRepository.clearTags();

    let newTab = this.followMasterRepository.getCurrentNewTabMode();
    let background = this.followMasterRepository.getCurrentBackgroundMode();
    this.broadcastToSlaves((client) => {
      client.activateIfExists(tag, newTab, background);
      client.clearHints();
    });
  }

  enqueue(key: string): void {
    switch (key) {
    case 'Enter':
      this.activate(this.getCurrentTag());
      return;
    case 'Esc':
      this.cancelFollow();
      return;
    case 'Backspace':
    case 'Delete':
      this.followKeyRepository.popKey();
      this.filter(this.getCurrentTag());
      return;
    }

    this.followKeyRepository.pushKey(key);

    let tag = this.getCurrentTag();
    let matched = this.followMasterRepository.getTagsByPrefix(tag);
    if (matched.length === 0) {
      this.cancelFollow();
    } else if (matched.length === 1) {
      this.activate(tag);
    } else {
      this.filter(tag);
    }
  }

  private broadcastToSlaves(handler: (client: FollowSlaveClient) => void) {
    let allFrames = [window.self].concat(Array.from(window.frames as any));
    let clients = allFrames.map(frame => new FollowSlaveClientImpl(frame));
    for (let client of clients) {
      handler(client);
    }
  }

  private getCurrentTag(): string {
    return this.followKeyRepository.getKeys().join('');
  }
}
