import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames/bind';
import 'terra-base/lib/baseStyles';
import LoadingOverlay from 'terra-overlay/lib/LoadingOverlay';
import OverlayContainer from 'terra-overlay/lib/OverlayContainer';
import ResizeObserver from 'resize-observer-polyfill';
import ScrollerUtils from '../utils/_ScrollerUtils';
import ScrollerItem from './_DataScrollerItem';
import styles from './DataScroller.scss';

const cx = classNames.bind(styles);

const propTypes = {
  /**
   * The ScrollerItem children to be placed within the infinite scroller..
   */
  children: PropTypes.node.isRequired,
  /**
   * Determines whether or not the loading indicator is visible and if callbacks are triggered.
   */
  isFinishedLoading: PropTypes.bool,
  /**
   * Callback trigger when new scroller items are requested..
   */
  onRequestItems: PropTypes.func,
};

const defaultProps = {
  children: [],
  isFinishedLoading: false,
};

const createSpacer = (height, index) => <div className={cx(['spacer'])} style={{ height }} key={`scrollerSpacer-${index}`} />;

class DataScroller extends React.Component {
  constructor(props) {
    super(props);

    this.update = this.update.bind(this);
    this.enableListeners = this.enableListeners.bind(this);
    this.disableListeners = this.disableListeners.bind(this);
    this.setContentNode = this.setContentNode.bind(this);
    this.updateItemCache = this.updateItemCache.bind(this);
    this.initializeItemCache = this.initializeItemCache.bind(this);
    this.updateScrollGroups = this.updateScrollGroups.bind(this);
    this.handleResize = this.throttle(this.handleResize.bind(this), 250);
    this.wrapChild = this.wrapChild.bind(this);

    this.initializeItemCache(props);
    this.preventInitialAdjust = true;
  }

  componentDidMount() {
    if (!this.listenersAdded) {
      this.enableListeners();
    }
    this.triggerItemRequest();
  }

  componentWillReceiveProps(newProps) {
    const newChildCount = React.Children.count(newProps.children);
    if (newChildCount > this.childCount) {
      this.lastChildIndex = this.childCount;
      this.loadingIndex += 1;
      this.updateItemCache(newProps);
    } else if (newChildCount < this.childCount) {
      this.initializeItemCache(newProps);
    }
  }

  componentDidUpdate() {
    if (!this.listenersAdded) {
      this.enableListeners();
    }
    this.renderNewChildren = false;
    this.preventUpdate = false;
    this.lastChildIndex = this.childCount;
  }

  componentWillUnmount() {
    this.disableListeners();
  }

  setContentNode(node) {
    this.contentNode = node;
  }

  triggerItemRequest() {
    if (!this.props.isFinishedLoading && !this.hasRequestedItems && this.props.onRequestItems) {
      this.hasRequestedItems = true;
      this.props.onRequestItems();
    }
  }

  updateItemCache(props) {
    this.childCount = React.Children.count(props.children);
    this.childrenArray = React.Children.toArray(props.children);
    this.hasRequestedItems = false;
    this.renderNewChildren = true;
  }

  initializeItemCache(props) {
    this.loadingIndex = 0;
    this.lastChildIndex = -1;
    this.itemsByIndex = [];
    this.scrollGroups = [];
    this.boundary = {
      topBoundryIndex: -1,
      hiddenTopHeight: -1,
      bottomBoundryIndex: -1,
      hiddenBottomHeight: -1,
    };
    this.updateItemCache(props);
  }

  enableListeners() {
    if (!this.contentNode) {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      this.handleResize(entries[0].contentRect);
    });
    this.resizeObserver.observe(this.contentNode);
    this.contentNode.addEventListener('scroll', this.update); // consider tick
    this.listenersAdded = true;
  }

  disableListeners() {
    if (!this.contentNode) {
      return;
    }
    this.resizeObserver.disconnect(this.contentNode);
    this.contentNode.removeEventListener('scroll', this.update); // consider tick
    this.listenersAdded = false;
  }

  throttle(fn) {
    return (...args) => {
      const context = this;
      const now = performance.now();
      if (this.last && now < this.last + 250) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.last = now;
          this.disableScroll = false;
          fn.apply(context, args);
        }, 250);
      } else {
        this.last = now;
        this.disableScroll = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.last = now;
          this.disableScroll = false;
          fn.apply(context, args);
        }, 250);
      }
    };
  }

  handleResize() {
    if (this.scrollHeight !== this.contentNode.scrollHeight) {
      this.adjustHeight();
    }
  }

  update() {
    if (!this.contentNode || this.disableScroll || this.preventUpdate) {
      return;
    }

    const contentData = ScrollerUtils.getContentData(this.contentNode);
    const hiddenItems = ScrollerUtils.getHiddenItems(this.scrollGroups, contentData, this.boundary.topBoundryIndex, this.boundary.bottomBoundryIndex);
    this.scrollHeight = contentData.scrollHeight;

    if (hiddenItems.topHiddenItem.index !== this.boundary.topBoundryIndex || hiddenItems.bottomHiddenItem.index !== this.boundary.bottomBoundryIndex) {
      this.preventUpdate = true;
      this.boundary = {
        topBoundryIndex: hiddenItems.topHiddenItem.index,
        hiddenTopHeight: hiddenItems.topHiddenItem.height,
        bottomBoundryIndex: hiddenItems.bottomHiddenItem.index,
        hiddenBottomHeight: hiddenItems.bottomHiddenItem.height,
      };
      this.forceUpdate();
    }

    if (ScrollerUtils.shouldTriggerItemRequest(contentData)) {
      this.triggerItemRequest();
    }
  }

  updateScrollGroups() {
    if (!this.contentNode) {
      return;
    }

    let groupHeight = 0;
    let groupIndex = 0;
    let captureOffsetTop = true;
    const maxGroupHeight = 1 * this.contentNode.clientHeight;
    this.scrollGroups = [];
    for (let i = 0; i < this.itemsByIndex.length; i += 1) {
      const item = this.itemsByIndex[i];
      if (this.scrollGroups[groupIndex] && item.height >= maxGroupHeight) {
        groupHeight = 0;
        groupIndex += 1;
        captureOffsetTop = true;
      }

      groupHeight += item.height;
      this.scrollGroups[groupIndex] = this.scrollGroups[groupIndex] || { items: [] };
      this.scrollGroups[groupIndex].items.push(i);
      this.scrollGroups[groupIndex].height = groupHeight;
      this.itemsByIndex[i].groupIndex = groupIndex;
      if (captureOffsetTop) {
        this.scrollGroups[groupIndex].offsetTop = this.itemsByIndex[i].offsetTop;
        captureOffsetTop = false;
      }

      if (groupHeight >= maxGroupHeight) {
        groupHeight = 0;
        groupIndex += 1;
        captureOffsetTop = true;
      }
    }
  }

  updateHeight(node, index) {
    if (node) {
      this.itemsByIndex[index] = this.itemsByIndex[index] || {};
      let updatedHeight = false;
      if (!this.itemsByIndex[index].height || Math.abs(this.itemsByIndex[index].height - node.clientHeight) > 1) {
        this.itemsByIndex[index].height = node.clientHeight;
        updatedHeight = true;
      }
      if (!this.itemsByIndex[index].offsetTop || Math.abs(this.itemsByIndex[index].offsetTop - node.offsetTop) > 1) {
        this.itemsByIndex[index].offsetTop = node.offsetTop;
      }
      if (this.itemsByIndex.length === this.childCount) {
        if (!this.scrollGroups.length) {
          this.updateScrollGroups();
        } else if (updatedHeight) {
          this.adjustHeight();
        }
      }
    }
  }

  adjustHeight() {
    if (this.preventInitialAdjust) {
      this.preventInitialAdjust = false;
      return;
    }
    if (this.contentNode) {
      this.itemsByIndex.forEach((item, itemIndex) => {
        const scrollItemNode = this.contentNode.querySelector(`[data-infinite-scroller-index="${itemIndex}"]`);
        if (scrollItemNode) {
          if (!this.itemsByIndex[itemIndex].height || Math.abs(scrollItemNode.clientHeight - this.itemsByIndex[itemIndex].height) > 1) {
            this.itemsByIndex[itemIndex].height = scrollItemNode.clientHeight;
          }
          if (!this.itemsByIndex[itemIndex].offsetTop || Math.abs(this.itemsByIndex[itemIndex].offsetTop - scrollItemNode.offsetTop) > 1) {
            this.itemsByIndex[itemIndex].offsetTop = scrollItemNode.offsetTop;
          }
          this.adjustTrailingItems(itemIndex);
        }
      });

      // needs to update offset tops of every other save
      this.updateScrollGroups();
      this.boundary = {
        topBoundryIndex: -1,
        hiddenTopHeight: -1,
        bottomBoundryIndex: -1,
        hiddenBottomHeight: -1,
      };
      this.update();
    }
  }

  adjustTrailingItems(index) {
    let lastTop = this.itemsByIndex[index].offsetTop;
    let lastHeight = this.itemsByIndex[index].height;
    for (let i = index + 1; i < this.itemsByIndex.length; i += 1) {
      lastTop += lastHeight;
      lastHeight = this.itemsByIndex[i].height;
      this.itemsByIndex[i].offsetTop = lastTop;
    }
  }

  wrapChild(child, index) {
    const wrappedCallBack = (node) => {
      this.updateHeight(node, index);
      if (child.props.refCallback) {
        child.props.refCallback(node);
      }
    };
    return (
      <ScrollerItem refCallback={wrappedCallBack} key={`scrollerItem-${index}`} scrollProps={{ 'data-infinite-scroller-index': index }}>
        {child}
      </ScrollerItem>
    );
  }

  render() {
    const {
      children,
      isFinishedLoading,
      onRequestItems,
      ...customProps
    } = this.props;

    let topSpacer;
    if (this.boundary.hiddenTopHeight > 0) {
      topSpacer = createSpacer(`${this.boundary.hiddenTopHeight}px`, 0);
    } else {
      topSpacer = createSpacer(`${0}px`, 0);
    }

    let bottomSpacer;
    if (this.boundary.hiddenBottomHeight > 0) {
      bottomSpacer = createSpacer(`${this.boundary.hiddenBottomHeight}px`, 1);
    } else {
      bottomSpacer = createSpacer(`${0}px`, 1);
    }

    if (this.childCount <= 0 && !isFinishedLoading) {
      return (
        <div {...customProps} className={cx(['infinite-scroller', customProps.className])} ref={this.setContentNode}>
          {topSpacer}
          <OverlayContainer className={cx(['full-loading'])} key="scroller-full-Loading">
            <LoadingOverlay isOpen isAnimated isRelativeToContainer backgroundStyle="dark" />
          </OverlayContainer>
          {bottomSpacer}
        </div>
      );
    }

    let loadingSpinner;
    if (!isFinishedLoading) {
      loadingSpinner = (
        <OverlayContainer className={cx(['loading'])} key={`scroller-Loading-${this.loadingIndex}`}>
          <LoadingOverlay isOpen isAnimated isRelativeToContainer backgroundStyle="dark" />
        </OverlayContainer>
      );
    }

    let forcedChildren;
    let visibleChildren;
    if ((!this.scrollGroups.length && this.lastChildIndex <= 0) || !this.renderNewChildren) {
      visibleChildren = ScrollerUtils.getVisibleScrollGroups(this.scrollGroups, this.childrenArray, this.boundary.topBoundryIndex, this.boundary.bottomBoundryIndex, this.wrapChild, this.childCount);
    } else {
      visibleChildren = ScrollerUtils.getVisibleScrollGroups(this.scrollGroups, this.childrenArray, this.boundary.topBoundryIndex, this.boundary.bottomBoundryIndex, this.wrapChild, this.lastChildIndex);
      forcedChildren = ScrollerUtils.getForcedChildren(this.lastChildIndex, this.childrenArray, this.wrapChild);
    }

    return (
      <div {...customProps} className={cx(['infinite-scroller', customProps.className])} ref={this.setContentNode}>
        {topSpacer}
        {visibleChildren}
        {bottomSpacer}
        {forcedChildren}
        {loadingSpinner}
      </div>
    );
  }
}

DataScroller.propTypes = propTypes;
DataScroller.defaultProps = defaultProps;

export default DataScroller;