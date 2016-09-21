/**
 * @license @product.name@ JS v@product.version@ (@product.date@)
 * Highcharts funnel module
 *
 * (c) 2010-2016 Torstein Honsi
 *
 * License: www.highcharts.com/license
 */
'use strict';
import H from '../parts/Globals.js';
import '../parts/Utilities.js';
import '../parts/Options.js';
import '../parts/Series.js';
import '../parts/Point.js';
	var correctFloat = H.correctFloat,
		noop = H.noop,
		pick = H.pick,
		Point = H.Point,
		Series = H.Series,
		seriesType = H.seriesType,
		seriesTypes = H.seriesTypes;

/* ****************************************************************************
 * Start Waterfall series code                                                *
 *****************************************************************************/
seriesType('waterfall', 'column', {
	dataLabels: {
		inside: true
	},
	/*= if (build.classic) { =*/
	lineWidth: 1,
	lineColor: '${palette.waterfallStroke}',
	dashStyle: 'dot',
	borderColor: '${palette.waterfallStroke}',
	states: {
		hover: {
			lineWidthPlus: 0 // #3126
		}
	}
	/*= } =*/

// Prototype members
}, {
	pointValKey: 'y',

	/**
	 * Translate data points from raw values
	 */
	translate: function () {
		var series = this,
			options = series.options,
			yAxis = series.yAxis,
			len,
			i,
			points,
			point,
			shapeArgs,
			stack,
			y,
			yValue,
			previousY,
			previousIntermediate,
			range,
			minPointLength = pick(options.minPointLength, 5),
			threshold = options.threshold,
			stacking = options.stacking,
			tooltipY;

		// run column series translate
		seriesTypes.column.prototype.translate.apply(this);
		series.minPointLengthOffset = 0;

		previousY = previousIntermediate = threshold;
		points = series.points;

		for (i = 0, len = points.length; i < len; i++) {
			// cache current point object
			point = points[i];
			yValue = this.processedYData[i];
			shapeArgs = point.shapeArgs;

			// get current stack
			stack = stacking && yAxis.stacks[(series.negStacks && yValue < threshold ? '-' : '') + series.stackKey];
			range = stack ?
				stack[point.x].points[series.index + ',' + i] :
				[0, yValue];

			// override point value for sums
			// #3710 Update point does not propagate to sum
			if (point.isSum) {
				point.y = correctFloat(yValue);
			} else if (point.isIntermediateSum) {
				point.y = correctFloat(yValue - previousIntermediate); // #3840
			}
			// up points
			y = Math.max(previousY, previousY + point.y) + range[0];
			shapeArgs.y = yAxis.translate(y, 0, 1);


			// sum points
			if (point.isSum) {
				shapeArgs.y = yAxis.translate(range[1], 0, 1);
				shapeArgs.height = Math.min(yAxis.translate(range[0], 0, 1), yAxis.len) - shapeArgs.y + series.minPointLengthOffset; // #4256

			} else if (point.isIntermediateSum) {
				shapeArgs.y = yAxis.translate(range[1], 0, 1);
				shapeArgs.height = Math.min(yAxis.translate(previousIntermediate, 0, 1), yAxis.len) - shapeArgs.y + series.minPointLengthOffset;
				previousIntermediate = range[1];

			// If it's not the sum point, update previous stack end position and get
			// shape height (#3886)
			} else {
				shapeArgs.height = yValue > 0 ?
					yAxis.translate(previousY, 0, 1) - shapeArgs.y :
					yAxis.translate(previousY, 0, 1) - yAxis.translate(previousY - yValue, 0, 1);
				previousY += yValue;
			}
			// #3952 Negative sum or intermediate sum not rendered correctly
			if (shapeArgs.height < 0) {
				shapeArgs.y += shapeArgs.height;
				shapeArgs.height *= -1;
			}

			point.plotY = shapeArgs.y = Math.round(shapeArgs.y) - (series.borderWidth % 2) / 2;
			shapeArgs.height = Math.max(Math.round(shapeArgs.height), 0.001); // #3151
			point.yBottom = shapeArgs.y + shapeArgs.height;

			if (shapeArgs.height <= minPointLength) {
				shapeArgs.height = minPointLength;
				series.minPointLengthOffset += minPointLength;
			}

			shapeArgs.y -= series.minPointLengthOffset;

			// Correct tooltip placement (#3014)
			tooltipY = point.plotY + (point.negative ? shapeArgs.height : 0) - series.minPointLengthOffset;
			if (series.chart.inverted) {
				point.tooltipPos[0] = yAxis.len - tooltipY;
			} else {
				point.tooltipPos[1] = tooltipY;
			}

		}
	},

	/**
	 * Call default processData then override yData to reflect waterfall's extremes on yAxis
	 */
	processData: function (force) {
		var series = this,
			options = series.options,
			yData = series.yData,
			points = series.options.data, // #3710 Update point does not propagate to sum
			point,
			dataLength = yData.length,
			threshold = options.threshold || 0,
			subSum,
			sum,
			dataMin,
			dataMax,
			y,
			i;

		sum = subSum = dataMin = dataMax = threshold;

		for (i = 0; i < dataLength; i++) {
			y = yData[i];
			point = points && points[i] ? points[i] : {};

			if (y === 'sum' || point.isSum) {
				yData[i] = correctFloat(sum);
			} else if (y === 'intermediateSum' || point.isIntermediateSum) {
				yData[i] = correctFloat(subSum);
			} else {
				sum += y;
				subSum += y;
			}
			dataMin = Math.min(sum, dataMin);
			dataMax = Math.max(sum, dataMax);
		}

		Series.prototype.processData.call(this, force);

		// Record extremes
		series.dataMin = dataMin;
		series.dataMax = dataMax;
	},

	/**
	 * Return y value or string if point is sum
	 */
	toYData: function (pt) {
		if (pt.isSum) {
			return (pt.x === 0 ? null : 'sum'); //#3245 Error when first element is Sum or Intermediate Sum
		}
		if (pt.isIntermediateSum) {
			return (pt.x === 0 ? null : 'intermediateSum'); //#3245
		}
		return pt.y;
	},

	/*= if (build.classic) { =*/
	/**
	 * Postprocess mapping between options and SVG attributes
	 */
	pointAttribs: function (point, state) {

		var upColor = this.options.upColor,
			attr;

		// Set or reset up color (#3710, update to negative)
		if (upColor && !point.options.color) {
			point.color = point.y > 0 ? upColor : null;
		}

		attr = seriesTypes.column.prototype.pointAttribs.call(this, point, state);

		// The dashStyle option in waterfall applies to the graph, not
		// the points
		delete attr.dashstyle;

		return attr;
	},
	/*= } =*/

	/**
	 * Return an empty path initially, because we need to know the stroke-width in order 
	 * to set the final path.
	 */
	getGraphPath: function () {
		return ['M', 0, 0];
	},

	/**
	 * Draw columns' connector lines
	 */
	getCrispPath: function () {

		var data = this.data,
			length = data.length,
			lineWidth = this.graph.strokeWidth() + this.borderWidth,
			normalizer = Math.round(lineWidth) % 2 / 2,
			path = [],
			prevArgs,
			pointArgs,
			i,
			d;

		for (i = 1; i < length; i++) {
			pointArgs = data[i].shapeArgs;
			prevArgs = data[i - 1].shapeArgs;

			d = [
				'M',
				prevArgs.x + prevArgs.width, prevArgs.y + normalizer,
				'L',
				pointArgs.x, prevArgs.y + normalizer
			];

			if (data[i - 1].y < 0) {
				d[2] += prevArgs.height;
				d[5] += prevArgs.height;
			}

			path = path.concat(d);
		}

		return path;
	},

	/**
	 * The graph is initally drawn with an empty definition, then updated with
	 * crisp rendering.
	 */
	drawGraph: function () {
		Series.prototype.drawGraph.call(this);
		this.graph.attr({
			d: this.getCrispPath()
		});
	},

	/**
	 * Extremes are recorded in processData
	 */
	getExtremes: noop

// Point members
}, {
	getClassName: function () {
		var className = Point.prototype.getClassName.call(this);

		if (this.isSum) {
			className += ' highcharts-sum';
		} else if (this.isIntermediateSum) {
			className += ' highcharts-intermediate-sum';
		}
		return className;
	}
});

/* ****************************************************************************
 * End Waterfall series code                                                  *
 *****************************************************************************/
